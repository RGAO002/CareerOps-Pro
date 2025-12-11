"""
CareerOps Pro - Main Entry Point
AI-Powered Resume Analysis & Optimization Platform
"""
import os
import sys

# --- macOS Fix for WeasyPrint/GTK libraries ---
# Fix for "OSError: cannot load library 'libgobject-2.0-0'" on macOS
if sys.platform == "darwin":
    # Add Homebrew library paths to DYLD_FALLBACK_LIBRARY_PATH
    # This helps Python (especially non-Homebrew Python) find libraries like Pango/Cairo
    extra_paths = [
        "/opt/homebrew/lib",      # Apple Silicon
        "/usr/local/lib",         # Intel Mac
        "/opt/homebrew/opt/libffi/lib" # libffi is keg-only
    ]
    current_path = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    new_path = ":".join(extra_paths) + ":" + current_path
    os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = new_path

import streamlit as st
import streamlit.components.v1 as components
import base64
import copy
from io import BytesIO
from pypdf import PdfReader
from dotenv import load_dotenv
from streamlit_js_eval import streamlit_js_eval

from services.resume_parser import parse_resume, parse_resume_from_image, is_scanned_pdf
from services.resume_analyzer import analyze_resume
from services.job_matcher import match_jobs, SAMPLE_JOBS
from services.resume_editor import edit_resume
from services.mock_interview import (
    text_to_speech, speech_to_text,
    generate_interview_questions, evaluate_answer, generate_interview_summary
)
from utils.html_renderer import render_resume_html
from utils.pdf_utils import convert_html_to_pdf
from utils.diff import compute_diff

# --- Config ---
load_dotenv()
st.set_page_config(
    layout="wide", 
    page_title="CareerOps Pro - AI Resume Platform",
    page_icon="🚀"
)

# --- Custom Styles ---
st.markdown("""
<style>
    .block-container { 
        padding-top: 2rem !important; 
        padding-bottom: 2rem;
    }
    
    header[data-testid="stHeader"] {
        background: transparent;
    }
    
    .main h2 {
        margin-top: 0 !important;
    }
    
    /* Score Card */
    .score-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 20px;
        padding: 30px;
        color: white;
        text-align: center;
        box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4);
    }
    .score-number {
        font-size: 72px;
        font-weight: 800;
        line-height: 1;
        margin-bottom: 10px;
    }
    .score-label {
        font-size: 18px;
        opacity: 0.9;
        text-transform: uppercase;
        letter-spacing: 2px;
    }
    
    /* Job Card */
    .job-card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 15px;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .job-card:hover {
        border-color: #667eea;
        box-shadow: 0 8px 25px rgba(102, 126, 234, 0.15);
        transform: translateY(-2px);
    }
    .job-title {
        font-size: 1.2rem;
        font-weight: 700;
        color: #1e293b;
        margin-bottom: 5px;
    }
    .job-company {
        color: #64748b;
        font-size: 0.95rem;
        margin-bottom: 10px;
    }
    .job-meta {
        display: flex;
        gap: 15px;
        color: #94a3b8;
        font-size: 0.85rem;
        margin-bottom: 15px;
    }
    .match-score {
        display: inline-block;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-weight: 600;
        font-size: 0.85rem;
    }
    .match-score.medium {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    }
    .match-score.low {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    }
    
    /* Feedback Card */
    .feedback-card {
        background: #f8fafc;
        border-radius: 10px;
        padding: 15px;
        margin-bottom: 10px;
        border-left: 4px solid #10b981;
    }
    .feedback-card.weakness {
        border-left-color: #f59e0b;
    }
    .feedback-title {
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 5px;
    }
    .feedback-desc {
        color: #64748b;
        font-size: 0.9rem;
    }
    
    /* Category Score */
    .category-score {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
    }
    .category-label {
        width: 120px;
        font-size: 0.9rem;
        color: #475569;
    }
    .category-bar {
        flex: 1;
        height: 8px;
        background: #e2e8f0;
        border-radius: 4px;
        overflow: hidden;
    }
    .category-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        border-radius: 4px;
        transition: width 0.5s ease;
    }
    .category-value {
        width: 40px;
        text-align: right;
        font-weight: 600;
        color: #1e293b;
        margin-left: 10px;
    }
    
    /* Chat Styles */
    .sugg-box {
        background-color: white;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 8px;
    }
    .edit-log {
        background-color: #f0fdf4;
        border: 1px solid #bbf7d0;
        padding: 10px;
        border-radius: 6px;
        margin-top: 5px;
        color: #166534;
    }
    .reverted-log {
        background-color: #f1f5f9;
        border: 1px solid #cbd5e1;
        color: #64748b;
        text-decoration: line-through;
    }
    
    /* PDF iframe */
    iframe { 
        width: 100%; 
        min-height: 850px; 
        border: 1px solid #ddd; 
        border-radius: 8px; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.1); 
    }
</style>
""", unsafe_allow_html=True)


# --- State Management ---
if 'page' not in st.session_state:
    st.session_state.page = "analysis"  # analysis | editor | interview
if 'resume_data' not in st.session_state:
    st.session_state.resume_data = None
if 'pdf_bytes' not in st.session_state:
    st.session_state.pdf_bytes = None
if 'raw_text' not in st.session_state:
    st.session_state.raw_text = ""
if 'analysis_result' not in st.session_state:
    st.session_state.analysis_result = None
if 'job_matches' not in st.session_state:
    st.session_state.job_matches = None
if 'selected_job' not in st.session_state:
    st.session_state.selected_job = None
if 'timeline' not in st.session_state:
    st.session_state.timeline = []
if 'trigger_action' not in st.session_state:
    st.session_state.trigger_action = None
if 'show_diff' not in st.session_state:
    st.session_state.show_diff = True
if 'current_diff' not in st.session_state:
    st.session_state.current_diff = {}
if 'previous_data' not in st.session_state:
    st.session_state.previous_data = None
# Interview state
if 'interview_questions' not in st.session_state:
    st.session_state.interview_questions = None
if 'current_q_index' not in st.session_state:
    st.session_state.current_q_index = 0
if 'interview_history' not in st.session_state:
    st.session_state.interview_history = []
if 'interview_complete' not in st.session_state:
    st.session_state.interview_complete = False
if 'interview_summary' not in st.session_state:
    st.session_state.interview_summary = None
if 'voice_choice' not in st.session_state:
    st.session_state.voice_choice = 'onyx'
if 'show_feedback' not in st.session_state:
    st.session_state.show_feedback = False
if 'current_evaluation' not in st.session_state:
    st.session_state.current_evaluation = None


# --- Helper Functions ---
def execute_edit(new_data, message_text):
    """Execute edit operation and update state."""
    import uuid
    
    snapshot_before = copy.deepcopy(st.session_state.resume_data)
    
    diff = compute_diff(snapshot_before, new_data)
    st.session_state.current_diff = diff
    st.session_state.previous_data = snapshot_before
    
    st.session_state.resume_data = new_data
    
    html = render_resume_html(new_data, diff=diff, show_diff=st.session_state.show_diff)
    st.session_state.pdf_bytes = convert_html_to_pdf(html)
    
    entry = {
        "id": str(uuid.uuid4()),
        "role": "assistant",
        "type": "edit",
        "content": message_text,
        "meta": { 
            "snapshot_before": snapshot_before, 
            "data_applied": new_data,
            "diff": diff
        },
        "is_reverted": False
    }
    st.session_state.timeline.append(entry)


# --- Sidebar ---
with st.sidebar:
    st.title("🚀 CareerOps Pro")
    st.caption("AI-Powered Resume Platform")
    
    st.divider()
    
    model = st.selectbox("🧠 Brain", ["gpt-4o", "gpt-3.5-turbo", "claude-3-5-sonnet-20241022"])
    default_key = os.getenv("OPENAI_API_KEY", "")
    api_key = st.text_input("🔑 API Key", value=default_key, type="password")
    
    st.divider()
    
    uploaded_file = st.file_uploader("📄 Upload Resume (PDF)", type="pdf")
    
    if uploaded_file and api_key:
        if st.button("🔍 Analyze Resume", type="primary", use_container_width=True):
            with st.spinner("Processing your resume..."):
                reader = PdfReader(uploaded_file)
                text = "".join([page.extract_text() or "" for page in reader.pages])
                
                uploaded_file.seek(0)
                pdf_bytes = uploaded_file.read()
                st.session_state.pdf_bytes = pdf_bytes
                
                if is_scanned_pdf(text):
                    st.info("📷 Detected scanned PDF, using Vision OCR...")
                    parse_result = parse_resume_from_image(pdf_bytes, api_key)
                    if parse_result.get("success"):
                        st.session_state.raw_text = parse_result.get("raw_text", "")
                else:
                    st.session_state.raw_text = text
                    parse_result = parse_resume(text, model, api_key)
                
                if parse_result.get("success"):
                    st.session_state.resume_data = parse_result["data"]
                    
                    analysis = analyze_resume(parse_result["data"], model, api_key)
                    if analysis["success"]:
                        st.session_state.analysis_result = analysis["analysis"]
                    
                    matches = match_jobs(parse_result["data"], model, api_key)
                    if matches["success"]:
                        st.session_state.job_matches = matches
                    
                    st.session_state.page = "analysis"
                    st.session_state.timeline = []
                    st.session_state.selected_job = None
                else:
                    st.error(f"❌ Failed to parse resume: {parse_result.get('error', 'Unknown error')}")
                    
                st.rerun()
    
    # Navigation
    if st.session_state.resume_data:
        st.divider()
        st.subheader("📍 Navigation")
        
        if st.button("📊 Resume Analysis", use_container_width=True, 
                     type="primary" if st.session_state.page == "analysis" else "secondary"):
            st.session_state.page = "analysis"
            st.rerun()
        
        if st.session_state.selected_job:
            if st.button("✏️ Resume Editor", use_container_width=True,
                         type="primary" if st.session_state.page == "editor" else "secondary"):
                st.session_state.page = "editor"
                st.rerun()
            
            if st.button("🎙️ Mock Interview", use_container_width=True,
                         type="primary" if st.session_state.page == "interview" else "secondary"):
                st.session_state.page = "interview"
                st.rerun()


# --- Main Content ---
if st.session_state.page == "analysis" and st.session_state.resume_data:
    # ============== Analysis Page ==============
    st.markdown("## 📊 Resume Analysis Dashboard")
    
    analysis = st.session_state.analysis_result
    matches = st.session_state.job_matches
    
    if analysis:
        col1, col2 = st.columns([1, 2])
        
        with col1:
            score = analysis.get("overall_score", 0)
            score_color = "#10b981" if score >= 80 else "#f59e0b" if score >= 60 else "#ef4444"
            st.markdown(f"""
                <div class="score-card" style="background: linear-gradient(135deg, {score_color} 0%, #1e293b 100%);">
                    <div class="score-number">{score}</div>
                    <div class="score-label">Resume Score</div>
                </div>
            """, unsafe_allow_html=True)
        
        with col2:
            st.markdown("### 📝 Summary")
            st.info(analysis.get("summary", "No summary available."))
            
            st.markdown("### 📈 Category Scores")
            for cat, score in analysis.get("category_scores", {}).items():
                st.markdown(f"""
                    <div class="category-score">
                        <div class="category-label">{cat.title()}</div>
                        <div class="category-bar"><div class="category-fill" style="width: {score}%"></div></div>
                        <div class="category-value">{score}</div>
                    </div>
                """, unsafe_allow_html=True)
        
        st.divider()
        
        col3, col4 = st.columns(2)
        
        with col3:
            st.markdown("### ✅ Strengths")
            for item in analysis.get("strengths", []):
                st.markdown(f"""
                    <div class="feedback-card">
                        <div class="feedback-title">{item.get('icon', '✅')} {item.get('title', '')}</div>
                        <div class="feedback-desc">{item.get('description', '')}</div>
                    </div>
                """, unsafe_allow_html=True)
        
        with col4:
            st.markdown("### ⚠️ Areas to Improve")
            for item in analysis.get("weaknesses", []):
                st.markdown(f"""
                    <div class="feedback-card weakness">
                        <div class="feedback-title">{item.get('icon', '⚠️')} {item.get('title', '')}</div>
                        <div class="feedback-desc">{item.get('description', '')}</div>
                    </div>
                """, unsafe_allow_html=True)
        
        # Quick Wins
        if analysis.get("quick_wins"):
            st.divider()
            st.markdown("### 🎯 Quick Wins")
            for i, tip in enumerate(analysis.get("quick_wins", []), 1):
                st.markdown(f"**{i}.** {tip}")
    
    # Job Matching
    if matches:
        st.divider()
        st.markdown("## 🎯 Best Matching Jobs")
        st.caption(matches.get("recommended_focus", ""))
        
        for job in matches.get("matches", [])[:5]:
            score = job.get("match_score", 0)
            score_class = "" if score >= 80 else "medium" if score >= 60 else "low"
            
            with st.container():
                st.markdown(f"""
                    <div class="job-card">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div class="job-title">{job.get('title', '')}</div>
                                <div class="job-company">{job.get('company', '')} • {job.get('location', '')}</div>
                            </div>
                            <div class="match-score {score_class}">{score}% Match</div>
                        </div>
                        <div class="job-meta">
                            <span>💰 {job.get('salary', 'N/A')}</span>
                            <span>📋 {job.get('type', 'Full-time')}</span>
                        </div>
                        <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 10px;">{job.get('description', '')[:150]}...</p>
                    </div>
                """, unsafe_allow_html=True)
                
                col_a, col_b = st.columns([3, 1])
                with col_a:
                    with st.expander("View Details"):
                        st.markdown("**Requirements:**")
                        for req in job.get("requirements", []):
                            st.markdown(f"- {req}")
                        
                        st.markdown("**Why You Match:**")
                        for reason in job.get("match_reasons", []):
                            st.markdown(f"✅ {reason}")
                        
                        if job.get("gaps"):
                            st.markdown("**Gaps to Address:**")
                            for gap in job.get("gaps", []):
                                st.markdown(f"⚠️ {gap}")
                
                with col_b:
                    if st.button("✨ Tailor Resume", key=f"tailor_{job.get('id')}", type="primary"):
                        st.session_state.selected_job = job
                        st.session_state.page = "editor"
                        st.session_state.timeline = []
                        
                        html = render_resume_html(st.session_state.resume_data)
                        st.session_state.pdf_bytes = convert_html_to_pdf(html)
                        st.session_state.current_diff = {}
                        
                        st.rerun()

elif st.session_state.page == "editor" and st.session_state.resume_data:
    # ============== Editor Page ==============
    import uuid
    
    if st.session_state.selected_job:
        job = st.session_state.selected_job
        st.markdown(f"""
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        padding: 15px 20px; border-radius: 10px; color: white; margin-bottom: 20px;">
                <div style="font-size: 0.85rem; opacity: 0.9;">Tailoring Resume For:</div>
                <div style="font-size: 1.3rem; font-weight: 700;">{job.get('title')} @ {job.get('company')}</div>
            </div>
        """, unsafe_allow_html=True)
    
    col_preview, col_chat = st.columns([1.3, 1])
    
    # PDF Preview
    with col_preview:
        st.markdown("### 📄 Live Resume Preview")
        
        if st.session_state.pdf_bytes:
            tool_col1, tool_col2, tool_col3 = st.columns([1, 1, 2])
            with tool_col1:
                clean_html = render_resume_html(st.session_state.resume_data)
                clean_pdf = convert_html_to_pdf(clean_html)
                if clean_pdf:
                    st.download_button("⬇️ Download", clean_pdf, file_name="resume.pdf")
            with tool_col2:
                new_show_diff = st.toggle("Diff", value=st.session_state.show_diff)
                if new_show_diff != st.session_state.show_diff:
                    st.session_state.show_diff = new_show_diff
                    html = render_resume_html(
                        st.session_state.resume_data, 
                        diff=st.session_state.current_diff, 
                        show_diff=new_show_diff
                    )
                    st.session_state.pdf_bytes = convert_html_to_pdf(html)
                    st.rerun()
            with tool_col3:
                if st.session_state.current_diff and st.session_state.show_diff:
                    changed = list(st.session_state.current_diff.keys())
                    if changed:
                        st.caption(f"📝 Modified: {', '.join(changed)}")
            
            b64 = base64.b64encode(st.session_state.pdf_bytes).decode('utf-8')
            st.markdown(
                f'<iframe src="data:application/pdf;base64,{b64}#toolbar=1&navpanes=0&view=FitH" '
                f'width="100%" height="850"></iframe>',
                unsafe_allow_html=True
            )
        else:
            st.info("Generating preview...")
    
    # Chat Co-Pilot
    with col_chat:
        st.markdown("### 🤖 AI Co-Pilot")
        
        if st.session_state.selected_job and st.session_state.selected_job.get("tailoring_tips"):
            with st.expander("💡 Tailoring Tips for this Job", expanded=True):
                for tip in st.session_state.selected_job.get("tailoring_tips", []):
                    st.markdown(f"- {tip}")
        
        if st.session_state.trigger_action:
            action = st.session_state.trigger_action
            st.session_state.trigger_action = None 
            
            if action['type'] == "apply_suggestion":
                prompt = f"Apply suggestion: {action['payload']}"
                st.session_state.timeline.append({
                    "id": str(uuid.uuid4()), "role": "user", "type": "chat", "content": prompt, "meta": {}
                })
                with st.spinner("Applying..."):
                    result = edit_resume(
                        prompt, 
                        st.session_state.resume_data, 
                        st.session_state.timeline[:-1], 
                        model, api_key,
                        st.session_state.selected_job
                    )
                    if result.get("type") == "edit":
                        execute_edit(result["data"], result.get("message", "Applied."))
                st.rerun()
            elif action['type'] == "revert":
                for item in st.session_state.timeline:
                    if item['id'] == action['payload']:
                        st.session_state.resume_data = item['meta']['snapshot_before']
                        item['is_reverted'] = True
                        st.session_state.current_diff = {}
                        html = render_resume_html(st.session_state.resume_data)
                        st.session_state.pdf_bytes = convert_html_to_pdf(html)
                        break
                st.rerun()
            elif action['type'] == "redo":
                for item in st.session_state.timeline:
                    if item['id'] == action['payload']:
                        st.session_state.resume_data = item['meta']['data_applied']
                        item['is_reverted'] = False
                        diff = item['meta'].get('diff', {})
                        st.session_state.current_diff = diff
                        html = render_resume_html(st.session_state.resume_data, diff=diff, show_diff=st.session_state.show_diff)
                        st.session_state.pdf_bytes = convert_html_to_pdf(html)
                        break
                st.rerun()
        
        chat_container = st.container(height=500)
        with chat_container:
            for item in st.session_state.timeline:
                if item['role'] == 'user':
                    with st.chat_message("user"): 
                        st.write(item['content'])
                else:
                    with st.chat_message("assistant"):
                        st.write(item['content'])
                        
                        if item['type'] == 'suggestion':
                            for idx, sugg in enumerate(item['meta']['list']):
                                c1, c2 = st.columns([4, 1])
                                c1.markdown(f"<div class='sugg-box'>{sugg}</div>", unsafe_allow_html=True)
                                if c2.button("Apply", key=f"s_{item['id']}_{idx}"):
                                    st.session_state.trigger_action = {"type": "apply_suggestion", "payload": sugg}
                                    st.rerun()
                                    
                        elif item['type'] == 'edit':
                            is_rev = item.get('is_reverted', False)
                            if is_rev:
                                st.markdown("<div class='edit-log reverted-log'>↩️ Reverted</div>", unsafe_allow_html=True)
                                if st.button("Redo", key=f"r_{item['id']}"):
                                    st.session_state.trigger_action = {"type": "redo", "payload": item['id']}
                                    st.rerun()
                            else:
                                st.markdown("<div class='edit-log'>✅ Applied</div>", unsafe_allow_html=True)
                                if st.button("Revert", key=f"u_{item['id']}"):
                                    st.session_state.trigger_action = {"type": "revert", "payload": item['id']}
                                    st.rerun()
        
        if prompt := st.chat_input("Ask me to modify your resume..."):
            st.session_state.timeline.append({
                "id": str(uuid.uuid4()), "role": "user", "type": "chat", "content": prompt, "meta": {}
            })
            
            with chat_container:
                with st.chat_message("user"): 
                    st.write(prompt)
                with st.chat_message("assistant"):
                    with st.spinner("Thinking..."):
                        result = edit_resume(
                            prompt, 
                            st.session_state.resume_data, 
                            st.session_state.timeline[:-1], 
                            model, api_key,
                            st.session_state.selected_job
                        )
                        
                        if result.get("type") == "edit":
                            execute_edit(result["data"], result.get("message", "Changes applied."))
                        elif result.get("type") == "suggestion":
                            st.session_state.timeline.append({
                                "id": str(uuid.uuid4()),
                                "role": "assistant",
                                "type": "suggestion",
                                "content": result.get("message", "Suggestions:"),
                                "meta": {"list": result.get("suggestion_list", [])}
                            })
                        else:
                            st.session_state.timeline.append({
                                "id": str(uuid.uuid4()),
                                "role": "assistant",
                                "type": "chat",
                                "content": result.get("message", "How can I help?"),
                                "meta": {}
                            })
            
            st.rerun()

elif st.session_state.page == "interview" and st.session_state.resume_data and st.session_state.selected_job:
    # ============== Interview Page ==============
    job = st.session_state.selected_job
    
    st.markdown(f"""
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); 
                    padding: 15px 20px; border-radius: 10px; color: white; margin-bottom: 20px;
                    display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 0.85rem; opacity: 0.8;">🎙️ CareerOps Pro Mock Interview</div>
                <div style="font-size: 1.2rem; font-weight: 700;">{job.get('title')} @ {job.get('company')}</div>
            </div>
            <div style="font-size: 2.5rem;">👔</div>
        </div>
    """, unsafe_allow_html=True)
    
    # Initialize interview if not started
    if st.session_state.interview_questions is None:
        st.markdown("### 🎯 Prepare for Your Interview")
        st.info("""
        **CareerOps Pro** will conduct a realistic mock interview:
        - Questions tailored to your resume gaps & target job
        - Voice-powered Q&A with audio feedback
        - Professional evaluation and tips
        """)
        
        col1, col2 = st.columns(2)
        with col1:
            num_questions = st.slider("Number of Questions", 3, 10, 5)
        with col2:
            voice_choice = st.selectbox("Interviewer Voice", 
                                        ["onyx", "echo", "alloy", "fable", "nova", "shimmer"],
                                        help="onyx = professional male, nova = professional female")
        
        if st.button("🚀 Start Interview", type="primary", use_container_width=True):
            with st.spinner("CareerOps Pro is preparing your interview..."):
                try:
                    result = generate_interview_questions(
                        st.session_state.resume_data, job, api_key, num_questions
                    )
                    st.session_state.interview_questions = result.get("questions", [])
                    st.session_state.current_q_index = 0
                    st.session_state.interview_history = []
                    st.session_state.interview_complete = False
                    st.session_state.interview_summary = None
                    st.session_state.voice_choice = voice_choice
                    st.session_state.show_feedback = False
                    st.session_state.current_evaluation = None
                    st.rerun()
                except Exception as e:
                    st.error(f"Failed to generate questions: {e}")
    
    # Interview in progress
    elif not st.session_state.interview_complete:
        questions = st.session_state.interview_questions
        q_idx = st.session_state.current_q_index
        
        if q_idx < len(questions):
            current_q = questions[q_idx]
            
            # Progress bar
            progress = (q_idx) / len(questions)
            st.progress(progress, text=f"Question {q_idx + 1} / {len(questions)}")
            
            # Question display
            q_type_color = "#667eea" if current_q.get('type') == 'behavioral' else "#f59e0b"
            difficulty = current_q.get('difficulty', 'medium')
            diff_emoji = "🟢" if difficulty == "easy" else "🟡" if difficulty == "medium" else "🔴"
            
            st.markdown(f"""
                <div style="background: white; border-left: 4px solid {q_type_color}; border-radius: 0 10px 10px 0; 
                            padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                    <div style="font-size: 1.1rem; color: #1e293b; line-height: 1.6; font-style: italic; margin-bottom: 10px;">
                        "{current_q.get('question', '')}"
                    </div>
                    <div style="display: flex; gap: 10px; font-size: 0.75rem;">
                        <span style="background: {q_type_color}; color: white; padding: 4px 10px; border-radius: 12px;">
                            {current_q.get('type', 'general').upper()}
                        </span>
                        <span style="color: #64748b;">{diff_emoji} {difficulty.upper()}</span>
                    </div>
                </div>
            """, unsafe_allow_html=True)
            
            # Tips
            with st.expander("💡 Answer Tips", expanded=False):
                for hint in current_q.get('good_answer_hints', [])[:3]:
                    st.caption(f"• {hint}")
            
            # Answer section (if not showing feedback)
            if not st.session_state.show_feedback:
                st.markdown('<hr style="margin: 20px 0;">', unsafe_allow_html=True)
                
                # Generate question audio
                if 'question_played' not in st.session_state:
                    st.session_state.question_played = {}
                
                q_key = f"q_{q_idx}"
                question_text = current_q.get('question', '')
                question_audio_b64 = ""
                
                if q_key not in st.session_state.question_played:
                    try:
                        voice = st.session_state.get('voice_choice', 'onyx')
                        audio_bytes = text_to_speech(question_text, api_key, voice)
                        question_audio_b64 = base64.b64encode(audio_bytes).decode()
                        st.session_state.question_played[q_key] = True
                        st.session_state[f'audio_b64_{q_idx}'] = question_audio_b64
                    except Exception as e:
                        st.error(f"Audio error: {e}")
                else:
                    question_audio_b64 = st.session_state.get(f'audio_b64_{q_idx}', '')
                
                # Prepare data for JavaScript API call
                import json
                question_json = json.dumps(current_q, ensure_ascii=False)
                resume_json = json.dumps(st.session_state.resume_data, ensure_ascii=False)
                job_json = json.dumps(job, ensure_ascii=False)
                
                # Full interview recording interface with real-time feedback
                interview_ui = f"""
                <div id="interview-box" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); 
                            border-radius: 20px; padding: 25px; font-family: system-ui;">
                    
                    <!-- Question Audio (auto-play) -->
                    <audio id="q-audio" autoplay style="display:none">
                        <source src="data:audio/mp3;base64,{question_audio_b64}" type="audio/mp3">
                    </audio>
                    
                    <!-- Status -->
                    <div style="text-align: center; margin-bottom: 15px;">
                        <div id="status-icon" style="font-size: 3rem;">🎧</div>
                        <div id="status-text" style="color: white; font-size: 1.1rem; font-weight: 600; margin-top: 10px;">
                            Listening to question...
                        </div>
                    </div>
                    
                    <!-- Start Answer Button -->
                    <div id="start-box" style="text-align: center; margin-bottom: 15px; display: none;">
                        <button id="start-btn" style="
                            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                            color: white; border: none; padding: 15px 50px; font-size: 1.1rem;
                            border-radius: 30px; cursor: pointer; font-weight: 700;
                            box-shadow: 0 4px 15px rgba(59,130,246,0.4);">
                            🎤 Start Answer
                        </button>
                    </div>
                    
                    <!-- Recording Controls (hidden initially) -->
                    <div id="recording-box" style="display: none;">
                        <!-- Countdown -->
                        <div style="text-align: center; margin-bottom: 12px;">
                            <div id="countdown" style="font-size: 3.5rem; font-weight: 800; color: #3b82f6; font-family: monospace;">60</div>
                            <div style="width: 100%; height: 8px; background: #334155; border-radius: 4px; margin-top: 10px;">
                                <div id="progress" style="width: 100%; height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 4px; transition: width 1s;"></div>
                            </div>
                        </div>
                        <!-- Finish Button -->
                        <div style="text-align: center; margin-bottom: 12px;">
                            <button id="finish-btn" style="
                                background: linear-gradient(135deg, #dc2626, #991b1b);
                                color: white; border: none; padding: 12px 30px; font-size: 1rem;
                                border-radius: 25px; cursor: pointer; font-weight: 600;
                                box-shadow: 0 4px 15px rgba(220,38,38,0.4);">
                                ⏹️ Finish & Submit
                            </button>
                        </div>
                    </div>
                    
                    <!-- Interviewer -->
                    <div style="text-align: center; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 15px; margin-bottom: 15px;">
                        <div id="interviewer" style="font-size: 3rem; transition: transform 0.2s;">🧑‍💼</div>
                        <div id="reaction" style="color: white; font-weight: 600; font-size: 1rem; margin-top: 8px;">Ready</div>
                    </div>
                    
                    <!-- Voice Bars -->
                    <div style="margin-bottom: 15px;">
                        <div style="color: #64748b; text-align: center; font-size: 0.8rem; margin-bottom: 8px;">🎤 Voice Level</div>
                        <div id="bars" style="display: flex; justify-content: center; align-items: flex-end; height: 50px; gap: 4px;">
                            <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
                            <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
                            <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
                        </div>
                    </div>
                    
                    <!-- Transcript -->
                    <div style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 15px; position: relative;">
                        <div style="color: #64748b; font-size: 0.75rem; margin-bottom: 8px;">💬 Live Transcript:</div>
                        <div id="transcript" style="color: white; font-size: 0.9rem; line-height: 1.6; min-height: 50px; max-height: 80px; overflow-y: auto;">
                            Waiting for question to finish...
                        </div>
                    </div>
                </div>
                
                <style>
                    .bar {{ width: 8px; background: #3b82f6; border-radius: 4px; height: 20%; transition: all 0.1s; }}
                    #start-btn:hover, #finish-btn:hover {{ transform: scale(1.05); }}
                </style>
                
                <script>
                (function() {{
                    const audio = document.getElementById('q-audio');
                    const statusIcon = document.getElementById('status-icon');
                    const statusText = document.getElementById('status-text');
                    const startBox = document.getElementById('start-box');
                    const startBtn = document.getElementById('start-btn');
                    const recordingBox = document.getElementById('recording-box');
                    const countdownEl = document.getElementById('countdown');
                    const progress = document.getElementById('progress');
                    const finishBtn = document.getElementById('finish-btn');
                    const interviewer = document.getElementById('interviewer');
                    const reaction = document.getElementById('reaction');
                    const transcript = document.getElementById('transcript');
                    const bars = document.querySelectorAll('.bar');
                    
                    let phase = 'question', countdown = 60, countdownTimer = null;
                    let isRecording = false, finalText = '', tempText = '';
                    let audioCtx, analyser, dataArr;
                    let speakTime = 0, silenceTime = 0, lastSound = Date.now(), lastReact = 0;
                    let audioStream = null;
                    
                    // Content analysis for real-time feedback
                    const NEG_STRONG = ['i don\\'t know', 'i dont know', 'don\\'t know', 'dont know', 'no idea', 'not sure'];
                    const NEG_FILLER = ['um', 'uh', 'hmm', 'umm', 'uhh', 'er'];
                    const NEG_WEAK = ['maybe', 'i guess', 'kind of', 'sort of'];
                    const POS = ['for example', 'achieved', 'increased', 'percent', '%', 'led', 'managed', 'developed', 'created', 'improved'];
                    
                    // Speech Recognition for real-time transcription
                    let recog = null;
                    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    
                    if (SpeechRecognition) {{
                        try {{
                            recog = new SpeechRecognition();
                            recog.continuous = true;
                            recog.interimResults = true;
                            recog.lang = 'en-US';
                            
                            recog.onresult = function(e) {{
                                tempText = '';
                                for (let i = e.resultIndex; i < e.results.length; i++) {{
                                    if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
                                    else tempText += e.results[i][0].transcript;
                                }}
                                const full = (finalText + tempText).trim();
                                transcript.innerHTML = finalText + '<span style="color:#94a3b8">' + tempText + '</span>';
                                updateReaction(full);
                            }};
                            
                            recog.onerror = function(e) {{
                                console.error('Speech recognition error:', e.error);
                                if (e.error === 'not-allowed') {{
                                    transcript.innerHTML = '<span style="color:#ef4444">⚠️ Microphone permission denied. Please allow microphone access.</span>';
                                }} else if (e.error === 'network') {{
                                    // Network error - Web Speech API requires internet connection to Google servers
                                    transcript.innerHTML = '<span style="color:#f59e0b">⚠️ Network error: Cannot connect to speech recognition service. Audio is still being recorded and will be transcribed after submission.</span>';
                                    // Stop trying to restart recognition on network errors
                                    if (recog) {{
                                        try {{ recog.stop(); }} catch(x) {{}}
                                    }}
                                }} else if (e.error === 'no-speech' && isRecording) {{
                                    // No speech detected - try to restart (this is normal)
                                    try {{ recog.start(); }} catch(x) {{ 
                                        console.error('Failed to restart:', x);
                                        // If restart fails, stop trying
                                        if (x.name === 'InvalidStateError') {{
                                            // Already started, ignore
                                        }}
                                    }}
                                }} else if (e.error === 'aborted') {{
                                    // Recognition was aborted - this is normal when stopping
                                    // Don't show error for this
                                }} else if (e.error !== 'no-speech') {{
                                    transcript.innerHTML = '<span style="color:#f59e0b">⚠️ Speech recognition error: ' + e.error + '. Audio is still being recorded.</span>';
                                }}
                            }};
                            
                            recog.onend = function() {{
                                if (isRecording) {{
                                    try {{ 
                                        recog.start(); 
                                    }} catch(x) {{
                                        console.error('Failed to restart recognition:', x);
                                        if (x.name === 'InvalidStateError') {{
                                            // Recognition already started, ignore
                                        }}
                                    }}
                                }}
                            }};
                        }} catch(err) {{
                            console.error('Failed to initialize speech recognition:', err);
                            transcript.innerHTML = '<span style="color:#ef4444">⚠️ Speech recognition not available: ' + err.message + '</span>';
                        }}
                    }} else {{
                        transcript.innerHTML = '<span style="color:#f59e0b">⚠️ Speech recognition not supported in this browser. Audio is still being recorded.</span>';
                    }}
                    
                    function updateReaction(txt) {{
                        if (Date.now() - lastReact < 4000) return;
                        lastReact = Date.now();
                        
                        const low = txt.toLowerCase();
                        const hasStrongNeg = NEG_STRONG.some(p => low.includes(p));
                        const hasFiller = NEG_FILLER.some(p => new RegExp('\\\\b' + p + '\\\\b').test(low));
                        const hasWeakNeg = NEG_WEAK.some(p => low.includes(p));
                        const hasPos = POS.some(p => low.includes(p));
                        
                        let r, c;
                        if (hasStrongNeg) {{
                            r = ['😕 Try harder', '🤔 Think...', '❓ Any guess?'][Math.floor(Math.random()*3)];
                            c = '#ef4444';
                        }} else if (hasFiller && !hasPos && speakTime < 2) {{
                            r = ['😐 Focus...', '🤔 Specifics?'][Math.floor(Math.random()*2)];
                            c = '#f59e0b';
                        }} else if (hasWeakNeg && !hasPos) {{
                            r = ['🤔 Be confident', '😐 More specific?'][Math.floor(Math.random()*2)];
                            c = '#f59e0b';
                        }} else if (silenceTime > 4) {{
                            r = ['😐 Continue...', '🤨 Go on...'][Math.floor(Math.random()*2)];
                            c = '#f59e0b';
                        }} else if (hasPos) {{
                            r = ['🎯 Great!', '😊 Excellent!', '👏 Nice!'][Math.floor(Math.random()*3)];
                            c = '#10b981';
                        }} else if (speakTime > 2) {{
                            r = ['👂 Listening...', '✍️ Noting...'][Math.floor(Math.random()*2)];
                            c = 'white';
                        }} else {{
                            r = ['👂 Listening...', '✍️ Noting...'][Math.floor(Math.random()*2)];
                            c = 'white';
                        }}
                        
                        reaction.textContent = r;
                        reaction.style.color = c;
                        interviewer.style.transform = 'translateY(-8px)';
                        setTimeout(() => interviewer.style.transform = 'translateY(0)', 200);
                    }}
                    
                    // Auto-play question and show start button when done
                    if (audio) {{
                        audio.onended = function() {{
                            phase = 'ready';
                            statusIcon.textContent = '🎤';
                            statusText.textContent = 'Ready to record your answer';
                            statusText.style.color = '#3b82f6';
                            reaction.textContent = '🎤 Click Start Answer';
                            reaction.style.color = '#3b82f6';
                            startBox.style.display = 'block';
                        }};
                        
                        // Fallback: show start button after 15 seconds
                        setTimeout(() => {{
                            if (phase === 'question') {{
                                phase = 'ready';
                                statusIcon.textContent = '🎤';
                                statusText.textContent = 'Ready to record your answer';
                                statusText.style.color = '#3b82f6';
                                reaction.textContent = '🎤 Click Start Answer';
                                reaction.style.color = '#3b82f6';
                                startBox.style.display = 'block';
                            }}
                        }}, 15000);
                    }}
                    
                    async function startRecording() {{
                        if (phase !== 'ready') return;
                        phase = 'recording';
                        isRecording = true;
                        finalText = '';
                        tempText = '';
                        
                        startBox.style.display = 'none';
                        recordingBox.style.display = 'block';
                        statusIcon.textContent = '🔴';
                        statusText.textContent = 'Recording... Speak now!';
                        statusText.style.color = '#dc2626';
                        reaction.textContent = '👂 Listening...';
                        reaction.style.color = 'white';
                        if (recog) {{
                            try {{
                                recog.start();
                                transcript.textContent = 'Speak now...';
                            }} catch(err) {{
                                console.error('Failed to start recognition:', err);
                                if (err.name === 'InvalidStateError') {{
                                    // Already started, this is fine
                                    transcript.textContent = 'Speak now...';
                                }} else {{
                                    transcript.innerHTML = '<span style="color:#f59e0b">⚠️ Live transcription unavailable. Audio is still being recorded and will be transcribed after submission.</span>';
                                }}
                            }}
                        }} else {{
                            transcript.innerHTML = '<span style="color:#f59e0b">⚠️ Live transcription not available in this browser. Audio is still being recorded and will be transcribed after submission.</span>';
                        }}
                        
                        try {{
                            audioStream = await navigator.mediaDevices.getUserMedia({{audio: true}});
                            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                            analyser = audioCtx.createAnalyser();
                            audioCtx.createMediaStreamSource(audioStream).connect(analyser);
                            analyser.fftSize = 256;
                            dataArr = new Uint8Array(analyser.frequencyBinCount);
                        }} catch(e) {{
                            console.error('Mic error:', e);
                            statusText.textContent = 'Error: Could not access microphone';
                            return;
                        }}
                        
                        // Start speech recognition (if not already started)
                        if (recog) {{
                            try {{ 
                                recog.start(); 
                            }} catch(e) {{
                                // Ignore if already started (InvalidStateError)
                                if (e.name !== 'InvalidStateError') {{
                                    console.error('Recognition start error:', e);
                                }}
                            }}
                        }}
                        visualize();
                        
                        // Start countdown
                        countdown = 60;
                        countdownTimer = setInterval(() => {{
                            countdown--;
                            countdownEl.textContent = countdown;
                            progress.style.width = (countdown/60*100) + '%';
                            if (countdown <= 10) {{
                                countdownEl.style.color = '#dc2626';
                                progress.style.background = '#dc2626';
                            }} else if (countdown <= 30) {{
                                countdownEl.style.color = '#f59e0b';
                                progress.style.background = '#f59e0b';
                            }}
                            if (countdown <= 0) finishRecording();
                        }}, 1000);
                    }}
                    
                    async function finishRecording() {{
                        if (phase === 'done') return;
                        phase = 'done';
                        isRecording = false;
                        if (countdownTimer) clearInterval(countdownTimer);
                        if (recog) try {{ recog.stop(); }} catch(e) {{}}
                        
                        // Stop audio stream
                        if (audioStream) {{
                            audioStream.getTracks().forEach(track => track.stop());
                        }}
                        
                        statusIcon.textContent = '⏳';
                        statusText.textContent = 'Evaluating your answer...';
                        statusText.style.color = '#3b82f6';
                        reaction.textContent = '⏳ Evaluating...';
                        reaction.style.color = '#3b82f6';
                        recordingBox.style.display = 'none';
                        
                        // Get transcript
                        const fullTranscript = (finalText + tempText).trim();
                        
                        // Prepare evaluation data
                        const questionData = {question_json};
                        const resumeData = {resume_json};
                        const jobData = {job_json};
                        
                        // Call OpenAI API directly for evaluation
                        try {{
                            const response = await fetch('https://api.openai.com/v1/chat/completions', {{
                                method: 'POST',
                                headers: {{
                                    'Authorization': 'Bearer {api_key}',
                                    'Content-Type': 'application/json'
                                }},
                                body: JSON.stringify({{
                                    model: 'gpt-4o',
                                    messages: [{{
                                        role: 'user',
                                        content: `You are an expert interviewer evaluating a candidate's response for the position of ${{jobData.title || 'Unknown'}}.

INTERVIEW QUESTION:
"${{questionData.question || ''}}"

QUESTION TYPE: ${{questionData.type || 'general'}}
FOCUS AREA: ${{questionData.focus_area || 'general skills'}}
DIFFICULTY: ${{questionData.difficulty || 'medium'}}

WHAT A GOOD ANSWER SHOULD INCLUDE:
${{JSON.stringify(questionData.good_answer_hints || [])}}

CANDIDATE'S ACTUAL ANSWER:
"${{fullTranscript}}"

CANDIDATE'S RESUME (for context and fact-checking):
${{JSON.stringify(resumeData, null, 2)}}

Evaluate the answer thoroughly and return JSON:
{{
    "score": <number from 1-10>,
    "score_breakdown": {{
        "relevance": <1-10, how well it addresses the question>,
        "depth": <1-10, level of detail and specificity>,
        "structure": <1-10, organization and clarity>,
        "authenticity": <1-10, seems genuine and consistent with resume>
    }},
    "strengths": ["Specific thing they did well 1", "Specific thing 2"],
    "improvements": ["Specific area to improve 1", "Specific area 2"],
    "sample_better_answer": "A brief example showing how to improve their response (2-3 sentences)",
    "follow_up_tip": "One actionable tip for answering similar questions in real interviews",
    "verbal_feedback": "A natural, encouraging 2-sentence feedback as if speaking to the candidate"
}}

Be constructive and encouraging while being honest about areas for improvement.
Return ONLY valid JSON.`
                                    }}],
                                    response_format: {{ type: 'json_object' }}
                                }})
                            }});
                            
                            if (!response.ok) {{
                                throw new Error(`API error: ${{response.status}}`);
                            }}
                            
                            const data = await response.json();
                            const evaluation = JSON.parse(data.choices[0].message.content);
                            
                            // Store evaluation result for Python to process
                            localStorage.setItem('evaluationResult', JSON.stringify(evaluation));
                            localStorage.setItem('answerText', fullTranscript);
                            localStorage.setItem('evaluationReady', 'true');
                            
                            statusIcon.textContent = '✅';
                            statusText.textContent = 'Processing evaluation...';
                            statusText.style.color = '#10b981';
                            reaction.textContent = '✅ Processing';
                            reaction.style.color = '#10b981';
                            
                            // Set a flag to trigger automatic check
                            localStorage.setItem('triggerEvalCheck', 'true');
                            
                            // The auto-check mechanism below will detect this and trigger rerun
                            
                        }} catch(error) {{
                            console.error('Evaluation error:', error);
                            statusIcon.textContent = '❌';
                            statusText.textContent = 'Evaluation failed. Please try again.';
                            statusText.style.color = '#dc2626';
                            reaction.textContent = '❌ Error';
                            reaction.style.color = '#dc2626';
                        }}
                    }}
                    
                    function visualize() {{
                        if (!isRecording || !analyser) return;
                        analyser.getByteFrequencyData(dataArr);
                        const avg = dataArr.reduce((a,b) => a+b, 0) / dataArr.length;
                        if (avg > 25) {{ speakTime += 0.05; silenceTime = 0; lastSound = Date.now(); }}
                        else {{ silenceTime = (Date.now() - lastSound) / 1000; speakTime = Math.max(0, speakTime - 0.02); }}
                        bars.forEach((bar, i) => {{
                            const h = Math.max(15, (dataArr[Math.floor(i * dataArr.length / bars.length)] / 255) * 100);
                            bar.style.height = h + '%';
                            if (avg > 80) bar.style.background = '#dc2626';
                            else if (avg > 40) bar.style.background = '#f59e0b';
                            else if (avg > 15) bar.style.background = '#22c55e';
                            else bar.style.background = '#3b82f6';
                        }});
                        requestAnimationFrame(visualize);
                    }}
                    
                    startBtn.onclick = startRecording;
                    finishBtn.onclick = finishRecording;
                }})();
                </script>
                """
                
                components.html(interview_ui, height=500)
                
                # Use native Streamlit buttons for reliability
                col_check, col_skip = st.columns(2)
                
                with col_check:
                    if st.button("🔄 Check Results", key=f"check_btn_{q_idx}", use_container_width=True):
                        # 增加计数器强制重新评估
                        if 'js_eval_counter' not in st.session_state:
                            st.session_state.js_eval_counter = 0
                        st.session_state.js_eval_counter += 1
                        st.rerun()
                
                with col_skip:
                    if st.button("⏭️ Skip Question", key=f"skip_btn_{q_idx}", use_container_width=True):
                        st.session_state.interview_history.append({
                            "question": current_q,
                            "answer": "(Skipped)",
                            "evaluation": {
                                "score": 0,
                                "strengths": [],
                                "improvements": ["Question was skipped"],
                                "verbal_feedback": "This question was skipped."
                            }
                        })
                        st.session_state.current_q_index += 1
                        if st.session_state.current_q_index >= len(questions):
                            st.session_state.interview_complete = True
                        st.rerun()
                
                # Use streamlit_js_eval to directly read from localStorage
                process_key = f"processed_{q_idx}"
                
                # Initialize counter for unique keys (needed for streamlit_js_eval)
                if 'js_eval_counter' not in st.session_state:
                    st.session_state.js_eval_counter = 0
                
                # Check for evaluation result using streamlit_js_eval
                eval_check_js = f"""
                    (function() {{
                        const ready = localStorage.getItem('evaluationReady') === 'true';
                        if (ready) {{
                            const evalData = localStorage.getItem('evaluationResult');
                            const answerText = localStorage.getItem('answerText');
                            
                            if (evalData && answerText) {{
                                // Clear localStorage to prevent duplicate processing
                                localStorage.removeItem('evaluationResult');
                                localStorage.removeItem('answerText');
                                localStorage.removeItem('evaluationReady');
                                
                                // Return data to Python
                                return JSON.stringify({{
                                    'ready': true,
                                    'answer': answerText,
                                    'evaluation': evalData
                                }});
                            }}
                        }}
                        return JSON.stringify({{'ready': false}});
                    }})()
                """
                
                # Execute JavaScript and get result
                result = streamlit_js_eval(
                    js_expressions=eval_check_js,
                    key=f"eval_check_{q_idx}_{st.session_state.js_eval_counter}"
                )
                
                # Process evaluation result if available
                # Check both the result and if we haven't processed this question yet
                if result and process_key not in st.session_state:
                    try:
                        data = json.loads(result)
                        
                        if data.get('ready'):
                            answer_text = data['answer']
                            evaluation = json.loads(data['evaluation'])  # evaluation is stored as JSON string
                            
                            # Store in interview history
                            st.session_state.interview_history.append({
                                "question": current_q,
                                "answer": answer_text,
                                "evaluation": evaluation
                            })
                            st.session_state.current_evaluation = evaluation
                            st.session_state.show_feedback = True
                            st.session_state[process_key] = True
                            
                            # Increment counter for next check
                            st.session_state.js_eval_counter += 1
                            
                            # Clear any trigger flags
                            clear_flags_js = """
                                <script>
                                    localStorage.removeItem('triggerEvalCheck');
                                </script>
                            """
                            st.markdown(clear_flags_js, unsafe_allow_html=True)
                            
                            # Rerun to show feedback
                            st.rerun()
                    except json.JSONDecodeError as e:
                        st.error(f"Failed to parse evaluation JSON: {e}")
                        if result:
                            st.error(f"Raw result: {result[:200]}...")
                    except Exception as e:
                        st.error(f"Error processing evaluation: {e}")
                        import traceback
                        st.error(traceback.format_exc())
                
                # Auto-check mechanism: Continuously poll for evaluation results and trigger rerun
                # This ensures automatic detection without manual button click or page reload
                auto_check_js = f"""
                    <script>
                        (function() {{
                            let checkCount = 0;
                            const maxChecks = 30; // Check for up to 15 seconds (30 * 500ms)
                            let triggered = false;
                            
                            const checkForEvaluation = function() {{
                                const ready = localStorage.getItem('evaluationReady') === 'true';
                                const trigger = localStorage.getItem('triggerEvalCheck') === 'true';
                                
                                if ((ready || trigger) && !triggered && checkCount < maxChecks) {{
                                    triggered = true;
                                    console.log('Evaluation ready, triggering automatic rerun...');
                                    
                                    // Clear the trigger flag
                                    localStorage.removeItem('triggerEvalCheck');
                                    
                                    // Method 1: Try to find and click the check button
                                    setTimeout(() => {{
                                        // Look for button in parent document (Streamlit's main frame)
                                        const parentDoc = window.parent.document || document;
                                        const buttons = parentDoc.querySelectorAll('button[data-testid]');
                                        
                                        let buttonFound = false;
                                        buttons.forEach(btn => {{
                                            const testId = btn.getAttribute('data-testid') || '';
                                            if (testId.includes('check_{q_idx}')) {{
                                                console.log('Found check button, clicking...');
                                                btn.click();
                                                buttonFound = true;
                                                return;
                                            }}
                                        }});
                                        
                                        // Method 2: If button not found, increment counter via query param
                                        if (!buttonFound) {{
                                            console.log('Button not found, using query param method');
                                            const url = new URL(window.location);
                                            const currentParam = url.searchParams.get('auto_check_{q_idx}');
                                            const newParam = (parseInt(currentParam || '0') + 1).toString();
                                            url.searchParams.set('auto_check_{q_idx}', newParam);
                                            window.history.replaceState({{}}, '', url);
                                            
                                            // Trigger rerun by dispatching hashchange
                                            window.dispatchEvent(new Event('hashchange'));
                                        }}
                                    }}, 200);
                                    
                                    return; // Stop checking
                                }}
                                
                                checkCount++;
                                if (checkCount < maxChecks && !triggered) {{
                                    // Continue checking every 500ms
                                    setTimeout(checkForEvaluation, 500);
                                }}
                            }};
                            
                            // Start checking immediately
                            checkForEvaluation();
                        }})();
                    </script>
                """
                st.markdown(auto_check_js, unsafe_allow_html=True)
                
                # Check for query parameter trigger (from auto-check mechanism)
                query_params = st.query_params
                if f'auto_check_{q_idx}' in query_params:
                    # Auto-check was triggered, increment counter to force re-evaluation
                    st.session_state.js_eval_counter += 1
            
            # Show feedback section
            else:
                st.markdown("---")
                evaluation = st.session_state.current_evaluation
                last_history = st.session_state.interview_history[-1]
                
                # Transcription
                st.markdown(f"""
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 8px;">📝 Your Answer:</div>
                        <div style="color: #1e293b; font-size: 0.95rem; line-height: 1.6;">"{last_history['answer']}"</div>
                    </div>
                """, unsafe_allow_html=True)
                
                # Score display
                score = evaluation.get('score', 0)
                score_color = "#10b981" if score >= 7 else "#f59e0b" if score >= 5 else "#ef4444"
                
                col_score, col_breakdown = st.columns([1, 2])
                with col_score:
                    st.markdown(f"""
                        <div style="background: linear-gradient(135deg, {score_color} 0%, #1e293b 100%);
                                    border-radius: 15px; padding: 25px; color: white; text-align: center;">
                            <div style="font-size: 3rem; font-weight: 800;">{score}/10</div>
                            <div style="font-size: 0.9rem; opacity: 0.9;">SCORE</div>
                        </div>
                    """, unsafe_allow_html=True)
                
                with col_breakdown:
                    breakdown = evaluation.get('score_breakdown', {})
                    st.markdown("**Score Breakdown:**")
                    for key, val in breakdown.items():
                        st.progress(val/10, text=f"{key.title()}: {val}/10")
                
                # Feedback
                col_good, col_improve = st.columns(2)
                with col_good:
                    st.success("✅ **Strengths:**")
                    for s in evaluation.get('strengths', [])[:3]:
                        st.markdown(f"• {s}")
                with col_improve:
                    st.warning("📈 **Improvements:**")
                    for i in evaluation.get('improvements', [])[:3]:
                        st.markdown(f"• {i}")
                
                # Verbal feedback with audio
                feedback_text = evaluation.get('verbal_feedback', f"Your score is {score} out of 10.")
                st.info(f"💬 **Feedback:** {feedback_text}")
                
                # Generate and play feedback audio
                if 'feedback_played' not in st.session_state:
                    st.session_state.feedback_played = {}
                
                feedback_key = f"feedback_{q_idx}"
                if feedback_key not in st.session_state.feedback_played:
                    try:
                        voice = st.session_state.get('voice_choice', 'onyx')
                        feedback_audio = text_to_speech(feedback_text, api_key, voice)
                        feedback_audio_b64 = base64.b64encode(feedback_audio).decode()
                        st.session_state.feedback_played[feedback_key] = True
                        st.session_state[f'feedback_audio_{q_idx}'] = feedback_audio_b64
                    except Exception as e:
                        st.session_state.feedback_played[feedback_key] = True
                        st.session_state[f'feedback_audio_{q_idx}'] = ""
                else:
                    feedback_audio_b64 = st.session_state.get(f'feedback_audio_{q_idx}', '')
                
                # Auto-play feedback audio
                if feedback_audio_b64:
                    st.markdown(f"""
                        <audio id="feedback-audio" autoplay style="display:none;">
                            <source src="data:audio/mp3;base64,{feedback_audio_b64}" type="audio/mp3">
                        </audio>
                    """, unsafe_allow_html=True)
                
                # Next button
                col_replay, col_next = st.columns(2)
                with col_replay:
                    if st.button("🔄 Replay Question", use_container_width=True):
                        st.session_state.show_feedback = False
                        st.rerun()
                
                with col_next:
                    if q_idx + 1 < len(questions):
                        if st.button("➡️ Next Question", type="primary", use_container_width=True):
                            st.session_state.current_q_index += 1
                            st.session_state.show_feedback = False
                            st.session_state.current_evaluation = None
                            st.rerun()
                    else:
                        if st.button("🏁 Complete Interview", type="primary", use_container_width=True):
                            st.session_state.interview_complete = True
                            st.session_state.show_feedback = False
                            st.rerun()
    
    # Interview complete - show summary
    else:
        st.balloons()
        st.markdown("## 🎉 Interview Complete!")
        
        if st.session_state.interview_summary is None:
            with st.spinner("CareerOps Pro is generating your performance report..."):
                try:
                    st.session_state.interview_summary = generate_interview_summary(
                        st.session_state.interview_history, job, api_key
                    )
                except Exception as e:
                    st.error(f"Failed to generate summary: {e}")
        
        summary = st.session_state.interview_summary
        if summary:
            overall_score = summary.get('overall_score', 0)
            score_color = "#10b981" if overall_score >= 7 else "#f59e0b" if overall_score >= 5 else "#ef4444"
            
            st.markdown(f"""
                <div style="background: linear-gradient(135deg, {score_color} 0%, #1e293b 100%);
                            border-radius: 20px; padding: 30px; color: white; text-align: center; margin: 20px 0;">
                    <div style="font-size: 4rem; font-weight: 800;">{overall_score:.1f}/10</div>
                    <div style="font-size: 1rem; opacity: 0.9;">Overall Interview Score</div>
                </div>
            """, unsafe_allow_html=True)
            
            readiness = summary.get('readiness_level', 'Unknown')
            readiness_color = "#10b981" if readiness == "Ready" else "#f59e0b" if readiness == "Almost Ready" else "#ef4444"
            readiness_emoji = "🚀" if readiness == "Ready" else "📈" if readiness == "Almost Ready" else "📚"
            
            st.markdown(f"""
                <div style="text-align: center; margin-bottom: 20px;">
                    <span style="background: {readiness_color}; color: white; padding: 10px 25px; border-radius: 25px; font-weight: 600; font-size: 1.1rem;">
                        {readiness_emoji} {readiness}
                    </span>
                </div>
            """, unsafe_allow_html=True)
            
            st.info(summary.get('overall_assessment', ''))
            
            col1, col2 = st.columns(2)
            with col1:
                st.markdown("### ✅ Top Strengths")
                for s in summary.get('top_strengths', []):
                    st.markdown(f"- {s}")
            with col2:
                st.markdown("### 📈 Areas to Improve")
                for a in summary.get('key_improvement_areas', []):
                    st.markdown(f"- {a}")
            
            st.markdown("### 🎯 Recommended Actions")
            for i, action in enumerate(summary.get('recommended_actions', []), 1):
                st.markdown(f"**{i}.** {action}")
            
            st.success(f"💪 {summary.get('encouraging_message', 'Great job!')}")
            
            # Question review
            with st.expander("📋 Question-by-Question Review"):
                for i, h in enumerate(st.session_state.interview_history, 1):
                    score = h['evaluation'].get('score', 0)
                    emoji = "🟢" if score >= 7 else "🟡" if score >= 5 else "🔴"
                    st.markdown(f"**Q{i}** {emoji} Score: {score}/10")
                    st.caption(f"Q: {h['question'].get('question', '')[:100]}...")
                    st.caption(f"Tip: {h['evaluation'].get('follow_up_tip', '')}")
                    st.markdown("---")
        
        if st.button("🔄 Start New Interview", use_container_width=True, type="primary"):
            st.session_state.interview_questions = None
            st.session_state.current_q_index = 0
            st.session_state.interview_history = []
            st.session_state.interview_complete = False
            st.session_state.interview_summary = None
            st.session_state.show_feedback = False
            st.session_state.current_evaluation = None
            st.rerun()

else:
    # ============== Welcome Page ==============
    st.markdown("""
        <div style="text-align: center; padding: 100px 50px;">
            <h1 style="font-size: 3.5rem; margin-bottom: 20px;">🚀 CareerOps Pro</h1>
            <p style="font-size: 1.3rem; color: #64748b; margin-bottom: 40px;">
                AI-Powered Resume Analysis & Optimization Platform
            </p>
            <div style="max-width: 600px; margin: 0 auto; text-align: left;">
                <h3>How it works:</h3>
                <p>1. 📄 <strong>Upload</strong> your resume (PDF)</p>
                <p>2. 📊 <strong>Get Analysis</strong> - Score, strengths, weaknesses</p>
                <p>3. 🎯 <strong>Match Jobs</strong> - Find best-fit positions</p>
                <p>4. ✨ <strong>Tailor Resume</strong> - AI-assisted editing for each job</p>
            </div>
            <p style="color: #94a3b8; margin-top: 40px;">👈 Upload your resume to get started</p>
        </div>
    """, unsafe_allow_html=True)