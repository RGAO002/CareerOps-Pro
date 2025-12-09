# 🚀 CareerOps Pro

**AI-Powered Resume Analysis & Optimization Platform**

CareerOps Pro is an intelligent resume assistant that analyzes your resume, scores it, matches you with relevant jobs, and helps you tailor your resume for specific positions using AI.

![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)
![Streamlit](https://img.shields.io/badge/Streamlit-1.28+-red.svg)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-green.svg)

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

---

## 🛠️ Installation

### Prerequisites
- Python 3.9+
- OpenAI API Key

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "Final Project"
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
Final Project/
├── app.py                      # Main entry point
├── requirements.txt            # Python dependencies
├── .env                        # API keys (create this)
│
├── services/                   # Business logic
│   ├── llm.py                 # LLM configuration
│   ├── resume_parser.py       # PDF text extraction + OCR
│   ├── resume_analyzer.py     # Resume scoring & feedback
│   ├── resume_editor.py       # AI-powered editing
│   └── job_matcher.py         # Job matching engine
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

---

## 🔧 Configuration

### Supported AI Models
- `gpt-4o` (default, recommended)
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

**Estimated cost per session:** $0.05 - $0.20 (depending on resume length and edits)

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
- [OpenAI](https://openai.com/) - GPT-4 API
- [WeasyPrint](https://weasyprint.org/) - PDF generation
- [PyMuPDF](https://pymupdf.readthedocs.io/) - PDF processing

---

**Built with ❤️ for BIA 810**

