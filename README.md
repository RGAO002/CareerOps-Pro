---
title: CareerOps Pro
emoji: 🚀
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# 🚀 CareerOps Pro

**AI-Powered Resume Analysis & Optimization Platform**

CareerOps Pro is an intelligent resume assistant that analyzes your resume, scores it, matches you with relevant jobs, and helps you tailor your resume for specific positions using AI.

![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)
![Streamlit](https://img.shields.io/badge/Streamlit-1.28+-red.svg)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--5.2-green.svg)

---

## ✨ Features

### 📊 Resume Analysis
- **Scoring System** - Get an overall score (0-100) with category breakdowns
- **Strengths & Weaknesses** - Detailed feedback on what works and what needs improvement
- **Quick Wins** - Actionable suggestions for immediate improvements

### 🎯 Job Matching
- **Smart Matching** - AI analyzes your skills and experience to find best-fit positions
- **Match Scores** - See how well you match each job (0-100%)
- **Gap Analysis** - Understand what skills you're missing for each role
- **20+ Job Categories** - Engineering, Marketing, Finance, Healthcare, Design, HR, Sales, and more

### ✏️ AI Resume Editor
- **Natural Language Editing** - Just tell the AI what to change ("Add Python to skills")
- **Live Preview** - See changes instantly in PDF format
- **Diff Highlighting** - Yellow highlights show what changed
- **Undo/Redo** - Revert any change with one click
- **Job-Targeted Tailoring** - Optimize your resume for specific positions

### 📷 OCR Support
- **Scanned PDF Support** - Upload image-based PDFs
- **GPT-4 Vision** - Automatically extracts text from scanned documents

### 🎙️ AI Mock Interview
- **Voice-Powered Practice** - Practice with CareerOps Pro that speaks questions aloud using text-to-speech
- **Auto-Play Questions** - Questions automatically play after generation, no manual interaction needed
- **Real-time Recording** - Start recording automatically after question audio completes
- **Live Transcription** - See your words transcribed in real-time as you speak using Web Speech API
- **Volume Visualization** - Dynamic visual bars show your voice level with color-coded feedback (blue → green → orange → red)
- **Real-time Feedback** - CareerOps Pro provides intelligent reactions during your answer based on content analysis
- **Content-Based Reactions** - AI analyzes what you say (not just voice patterns) to give appropriate feedback
- **60-Second Countdown** - Automatic recording with visual countdown timer and progress bar
- **Personalized Questions** - Questions tailored to your resume gaps and target job requirements
- **Detailed Evaluation** - Get comprehensive scores (Relevance, Depth, Structure, Authenticity) after each answer
- **Instant Feedback** - Receive strengths, improvements, sample better answers, and actionable tips
- **Interview Summary** - Complete performance report with overall assessment and recommendations

---

## 🛠️ Installation

### Prerequisites
- Python 3.9+
- OpenAI API Key
- **macOS**: System libraries for PDF generation (see below)

### macOS System Dependencies

WeasyPrint requires native libraries for PDF generation. Install via Homebrew:

```bash
brew install cairo pango gdk-pixbuf libffi
```

> **Note**: If you don't have Homebrew, install it first:
> ```bash
> /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
> ```

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "CareerOps-Pro"
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   ```bash
   # Create .env file
   echo "OPENAI_API_KEY=your-api-key-here" > .env
   ```

4. **Run the application**
   ```bash
   streamlit run app.py
   ```

5. **Open in browser**
   ```
   http://localhost:8501
   ```

---

## 📁 Project Structure

```
CareerOps-Pro/
├── app.py                      # Main entry point
├── requirements.txt            # Python dependencies
├── .env                        # API keys (create this)
│
├── services/                   # Business logic
│   ├── llm.py                 # LLM configuration
│   ├── resume_parser.py       # PDF text extraction + OCR
│   ├── resume_analyzer.py     # Resume scoring & feedback
│   ├── resume_editor.py       # AI-powered editing
│   ├── job_matcher.py         # Job matching engine
│   └── mock_interview.py      # Mock interview service
│       ├── Question generation
│       ├── Text-to-Speech (TTS)
│       ├── Speech-to-Text (STT)
│       ├── Answer evaluation
│       └── Interview summary
│
├── utils/                      # Utilities
│   ├── diff.py                # Change detection
│   ├── html_renderer.py       # Resume → HTML
│   └── pdf_utils.py           # HTML → PDF
│
└── pages/                      # (Reserved for future use)
```

---

## 🚀 Usage

### 1. Upload Resume
- Click "Upload Resume (PDF)" in the sidebar
- Supports both text-based and scanned PDFs

### 2. View Analysis
- See your resume score and category breakdowns
- Review strengths, weaknesses, and quick wins

### 3. Browse Job Matches
- View jobs ranked by match percentage
- See why you match and what gaps exist

### 4. Tailor Your Resume
- Click "Tailor Resume" on any job
- Use natural language to make changes:
  - "Change my name to John Doe"
  - "Add AWS certification"
  - "Make the summary more impactful"
  - "Reorder sections: education before experience"

### 5. Download
- Click "Download" to get your optimized PDF

### 6. Practice Interview
- After selecting a job, click "🎙️ Mock Interview" in the navigation
- Choose the number of questions (3-10) and interviewer voice (onyx, echo, alloy, fable, nova, shimmer)
- Click "🚀 Start Interview" to generate personalized questions
- Questions automatically play via text-to-speech - just listen!
- Click "🎤 Start Answer" to begin recording (60-second countdown)
- Speak naturally - see live transcription and real-time interviewer reactions
- Watch the volume bars change color based on your voice level
- Click "⏹️ Finish & Submit" to end recording early, or wait for automatic submission
- Click "🔄 Check Results" to view your evaluation (scores, feedback, tips)
- After all questions, receive a comprehensive interview summary

---

## 🔧 Configuration

### Supported AI Models
- `gpt-5.2` (default, recommended)
- `gpt-4o`
- `gpt-3.5-turbo` (faster, cheaper)
- `claude-3-5-sonnet-20241022` (requires Anthropic key)

### Environment Variables
| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI API key |

---

## 📝 API Usage

The app uses OpenAI's API for:
- Resume parsing and analysis
- Job matching
- Resume editing suggestions
- OCR (GPT-4 Vision for scanned PDFs)
- **Mock Interview:**
  - Question generation (GPT-4o)
  - Text-to-Speech (OpenAI TTS) for speaking questions
  - Speech-to-Text (Whisper) for transcribing answers
  - Answer evaluation (GPT-4o) for scoring and feedback
  - Interview summary generation (GPT-4o)

**Estimated cost per session:** $0.05 - $0.50 (depending on resume length, edits, and interview duration)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is for educational purposes (BIA 810 Final Project).

---

## 🙏 Acknowledgments

- [Streamlit](https://streamlit.io/) - Web framework
- [LangChain](https://langchain.com/) - LLM orchestration
- [OpenAI](https://openai.com/) - GPT-4o, TTS, and Whisper APIs
- [WeasyPrint](https://weasyprint.org/) - PDF generation
- [PyMuPDF](https://pymupdf.readthedocs.io/) - PDF processing
- [streamlit-js-eval](https://github.com/whitphx/streamlit-js-eval) - JavaScript evaluation bridge
- Web Audio API & Web Speech API - Real-time audio processing and transcription

---

**Built by Ruoping Gao, Shuang Liu & Zhenyan Yao for BIA 810**

