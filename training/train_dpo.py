"""
DPO Training Script — designed for Google Colab free tier (T4 16GB)

Uses Unsloth for 2x faster training with 60% less memory.
Trains a LoRA adapter on Qwen 2.5 7B to humanize AI-generated text.

Usage on Google Colab:
  1. Upload dpo_data.jsonl (from prepare_data.py)
  2. Install: pip install unsloth trl datasets
  3. Run this script

Or from terminal (if you have a GPU):
  python train_dpo.py --data dpo_data.jsonl --epochs 3
"""

import argparse
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def load_dpo_data(path: str) -> list[dict]:
    """Load JSONL DPO data."""
    data = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                data.append(json.loads(line))
    logger.info(f"Loaded {len(data)} DPO pairs from {path}")
    return data


def main():
    parser = argparse.ArgumentParser(description="DPO training with Unsloth")
    parser.add_argument("--data", default="dpo_data.jsonl", help="Path to DPO JSONL")
    parser.add_argument("--model", default="unsloth/Qwen2.5-7B-Instruct", help="Base model")
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=2, help="Per-device batch size")
    parser.add_argument("--lr", type=float, default=5e-5, help="Learning rate")
    parser.add_argument("--lora-rank", type=int, default=16, help="LoRA rank")
    parser.add_argument("--output-dir", default="./humanizer-model", help="Save directory")
    parser.add_argument("--push-to-hub", type=str, default=None, help="HuggingFace repo to push to")
    args = parser.parse_args()

    # ── 1. Check GPU ──
    import torch
    if not torch.cuda.is_available():
        logger.error("No CUDA GPU found! This script requires a GPU.")
        logger.error("Run on Google Colab (free T4) or a cloud GPU.")
        return
    logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
    logger.info(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    # ── 2. Load model with Unsloth (2x faster, 60% less memory) ──
    from unsloth import FastLanguageModel

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.model,
        max_seq_length=1024,
        dtype=None,  # auto-detect (float16 on T4, bfloat16 on A100)
        load_in_4bit=True,  # 4-bit quantization → fits in 16GB VRAM
    )

    # ── 3. Add LoRA adapters ──
    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_rank,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        lora_alpha=args.lora_rank * 2,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",  # saves more memory
    )

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    logger.info(f"Trainable: {trainable:,} / {total:,} params ({100*trainable/total:.2f}%)")

    # ── 4. Prepare dataset ──
    from datasets import Dataset

    raw_data = load_dpo_data(args.data)

    # DPO format: each row needs 'prompt', 'chosen', 'rejected'
    # TRL's DPOTrainer expects these as conversation format
    def format_for_dpo(example):
        return {
            "prompt": [
                {"role": "user", "content": example["prompt"]}
            ],
            "chosen": [
                {"role": "assistant", "content": example["chosen"]}
            ],
            "rejected": [
                {"role": "assistant", "content": example["rejected"]}
            ],
        }

    dataset = Dataset.from_list(raw_data)
    dataset = dataset.map(format_for_dpo)

    # Train/eval split (90/10)
    split = dataset.train_test_split(test_size=0.1, seed=42)
    train_dataset = split["train"]
    eval_dataset = split["test"]

    logger.info(f"Train: {len(train_dataset)}, Eval: {len(eval_dataset)}")

    # ── 5. DPO Training ──
    from trl import DPOConfig, DPOTrainer

    training_args = DPOConfig(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.1,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=50,
        save_strategy="steps",
        save_steps=100,
        save_total_limit=3,
        beta=0.1,  # DPO beta — lower = stronger preference learning
        max_length=1024,
        max_prompt_length=512,
        report_to="none",
    )

    trainer = DPOTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        processing_class=tokenizer,
    )

    logger.info("Starting DPO training...")
    trainer.train()

    # ── 6. Save model (local + Google Drive backup) ──
    logger.info(f"Saving model to {args.output_dir}")
    model.save_pretrained(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    # Auto-backup to Google Drive if available
    drive_path = Path("/content/drive/MyDrive/humanizer-model")
    try:
        import shutil
        if Path("/content/drive/MyDrive").exists():
            if drive_path.exists():
                shutil.rmtree(drive_path)
            shutil.copytree(args.output_dir, drive_path)
            logger.info(f"Backed up model to Google Drive: {drive_path}")
        else:
            logger.warning("Google Drive not mounted — skipping backup. Run: from google.colab import drive; drive.mount('/content/drive')")
    except Exception as e:
        logger.warning(f"Drive backup failed: {e}")

    # Optionally push to HuggingFace Hub
    if args.push_to_hub:
        logger.info(f"Pushing to HuggingFace Hub: {args.push_to_hub}")
        model.push_to_hub(args.push_to_hub)
        tokenizer.push_to_hub(args.push_to_hub)

    # ── 7. Quick test ──
    logger.info("\n" + "=" * 50)
    logger.info("Quick test — humanize a sample AI text:")
    logger.info("=" * 50)

    FastLanguageModel.for_inference(model)

    test_inputs = [
        "Spearheaded the development and implementation of a comprehensive data analytics platform, leveraging cutting-edge technologies to drive actionable insights across the organization.",
        "Orchestrated cross-functional collaboration between engineering and product teams, resulting in a 40% improvement in deployment efficiency and stakeholder satisfaction.",
    ]

    for test_text in test_inputs:
        prompt = f"Rewrite this text to sound natural and human-written:\n{test_text}"
        messages = [{"role": "user", "content": prompt}]
        tok_out = tokenizer.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=True, return_tensors="pt"
        )
        # Handle both tensor and BatchEncoding returns
        if hasattr(tok_out, "input_ids"):
            input_ids = tok_out["input_ids"].to("cuda")
        else:
            input_ids = tok_out.to("cuda")

        outputs = model.generate(
            input_ids=input_ids,
            max_new_tokens=256,
            temperature=0.7,
            top_p=0.9,
        )
        result = tokenizer.decode(outputs[0][input_ids.shape[-1]:], skip_special_tokens=True)
        logger.info(f"\nAI:    {test_text}")
        logger.info(f"Human: {result}")

    logger.info(f"\nModel saved to: {args.output_dir}")
    logger.info("Upload this directory to Together AI or HuggingFace for deployment.")


if __name__ == "__main__":
    main()
