"""
CareerOps Pro - Main Entry Point
AI-Powered Resume Analysis & Optimization Platform
"""
import os
import sys
import uuid

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

import re
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
from services.job_matcher import match_jobs, parse_custom_jd, parse_jd_for_tracker, SAMPLE_JOBS
from services.resume_editor import edit_resume, tailor_section
from services.humanizer import humanize_resume, humanize_text, check_credits
from services.cover_letter import generate_cover_letter, edit_cover_letter
from services.mock_interview import (
    text_to_speech, speech_to_text,
    generate_interview_questions, evaluate_answer, generate_interview_summary
)
from utils.html_renderer import render_resume_html, render_resume_html_for_pdf
from utils.pdf_utils import convert_html_to_pdf
from utils.diff import compute_diff
from utils.session_manager import save_session, load_session, delete_session, rename_session, list_sessions, get_thumbnail_path
from services.job_tracker import (
    load_tracker, add_job, update_job, delete_job,
    import_from_session as tracker_import,
    get_jobs_by_status, get_custom_columns, add_custom_column,
    delete_custom_column, update_custom_field,
    STATUSES, STATUS_LABELS, STATUS_COLORS, COLUMN_TYPES, COLUMN_TYPE_LABELS,
    WORK_TYPES, WORK_TYPE_LABELS
)
from services.keyword_profile import (
    extract_and_cache_all, aggregate_keywords,
    compute_resume_gaps, load_keyword_cache,
    add_keyword_to_job, remove_keyword_from_job,
    update_job_keywords, SKILL_CATEGORIES, is_soft_skill,
)
from utils.demo_data import seed_demo_data, ensure_demo_session
import plotly.express as px
import plotly.graph_objects as go

# --- Config ---
load_dotenv()
# Only seed demo data on cloud (HuggingFace Spaces), not locally
if os.environ.get("SPACE_ID"):
    seed_demo_data()

# ── Streamlit Cloud secrets → env fallback ─────────────────────
# On Streamlit Cloud, secrets are set in the dashboard and accessed
# via st.secrets. Bridge them to os.environ so all downstream code
# (services/llm.py, etc.) can use os.getenv() as usual.
try:
    _secrets = dict(st.secrets)
except Exception:
    _secrets = {}
for _secret_key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"):
    if not os.getenv(_secret_key):
        _val = _secrets.get(_secret_key, "")
        if _val:
            os.environ[_secret_key] = str(_val).strip()
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
        border: 1px solid rgba(128,128,128,0.2);
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
        margin-bottom: 5px;
    }
    .job-company {
        opacity: 0.7;
        font-size: 0.95rem;
        margin-bottom: 10px;
    }
    .job-meta {
        display: flex;
        gap: 15px;
        opacity: 0.6;
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
        background: rgba(128,128,128,0.08);
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
        margin-bottom: 5px;
    }
    .feedback-desc {
        opacity: 0.7;
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
        opacity: 0.7;
    }
    .category-bar {
        flex: 1;
        height: 8px;
        background: rgba(128,128,128,0.2);
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
        margin-left: 10px;
    }
    
    /* Chat Styles */
    .sugg-box {
        background: rgba(128,128,128,0.08);
        border: 1px solid rgba(128,128,128,0.2);
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 8px;
    }
    .edit-log {
        background-color: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.3);
        padding: 10px;
        border-radius: 6px;
        margin-top: 5px;
        color: #10b981;
    }
    .reverted-log {
        background: rgba(128,128,128,0.08);
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

    /* Sidebar home title — looks like st.title but clickable */
    .st-key-sidebar_home_title button {
        background: none !important;
        border: none !important;
        padding: 0 !important;
        text-align: left !important;
        cursor: pointer !important;
        color: inherit !important;
        box-shadow: none !important;
    }
    .st-key-sidebar_home_title button p {
        font-size: 1.75rem !important;
        font-weight: 700 !important;
        line-height: 1.2 !important;
    }
    .st-key-sidebar_home_title button:hover {
        opacity: 0.7 !important;
    }
    .st-key-sidebar_home_title button:active,
    .st-key-sidebar_home_title button:focus {
        background: none !important;
        box-shadow: none !important;
        outline: none !important;
    }

    /* Guided tour callout */
    .tour-callout {
        background: linear-gradient(135deg, #1e40af, #3b82f6);
        border: 1px solid #60a5fa;
        border-radius: 10px;
        padding: 12px 16px;
        margin: 8px 0;
        color: #f0f9ff;
        position: relative;
        animation: tour-pulse 2s ease-in-out infinite;
    }
    .tour-callout::before {
        content: "";
        position: absolute;
        top: -8px;
        left: 20px;
        width: 0; height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 8px solid #1e40af;
    }
    .tour-callout .tour-step-badge {
        display: inline-block;
        background: #dbeafe;
        color: #1e3a8a;
        font-weight: 700;
        font-size: 0.75rem;
        padding: 2px 8px;
        border-radius: 10px;
        margin-bottom: 6px;
    }
    .tour-callout .tour-text {
        font-size: 0.85rem;
        line-height: 1.5;
        margin: 0;
    }
    @keyframes tour-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
        50% { box-shadow: 0 0 0 6px rgba(59,130,246,0); }
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
# Tailor state
if 'tailor_results' not in st.session_state:
    st.session_state.tailor_results = None
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
# Session management
if 'current_session_id' not in st.session_state:
    st.session_state.current_session_id = None
if 'pdf_filename' not in st.session_state:
    st.session_state.pdf_filename = None
if 'resume_html' not in st.session_state:
    st.session_state.resume_html = None
# Cover letter state
if 'cover_letter_text' not in st.session_state:
    st.session_state.cover_letter_text = ""
if 'cover_letter_question' not in st.session_state:
    st.session_state.cover_letter_question = ""
if 'cl_timeline' not in st.session_state:
    st.session_state.cl_timeline = []
# Visitor isolation — persist visitor_id in URL query params so it survives refresh
_qp_vid = st.query_params.get("vid", "")
if _qp_vid and len(_qp_vid) >= 8:
    st.session_state.visitor_id = _qp_vid
elif 'visitor_id' not in st.session_state:
    st.session_state.visitor_id = str(uuid.uuid4())[:12]
    st.query_params["vid"] = st.session_state.visitor_id
# Guided tour
if 'tour_step' not in st.session_state:
    st.session_state.tour_step = 0  # 0 = off, 1-4 = active steps

def _tour_callout(step: int, total: int, text: str, arrow_down: bool = False):
    """Render a tour callout bubble if the current tour step matches."""
    if st.session_state.tour_step != step:
        return
    arrow_css = ""
    if arrow_down:
        arrow_css = """
        .tour-callout::before { top: auto; bottom: -8px;
            border-bottom: none; border-top: 8px solid #1e40af; }
        """
    st.markdown(f"""
    <style>{arrow_css}</style>
    <div class="tour-callout">
        <span class="tour-step-badge">Step {step} / {total}</span>
        <p class="tour-text">{text}</p>
    </div>
    """, unsafe_allow_html=True)
    tc1, tc2 = st.columns(2)
    with tc1:
        if st.button("Skip Tour", key=f"tour_skip_{step}", use_container_width=True):
            st.session_state.tour_step = 0
            st.rerun()
    with tc2:
        if step < total:
            if st.button("Next →", key=f"tour_next_{step}", type="primary", use_container_width=True):
                st.session_state.tour_step = step + 1
                st.rerun()
        else:
            if st.button("Done ✓", key=f"tour_done_{step}", type="primary", use_container_width=True):
                st.session_state.tour_step = 0
                st.rerun()
if 'cl_trigger_action' not in st.session_state:
    st.session_state.cl_trigger_action = None
# Job Tracker UI state
if 'tracker_filter' not in st.session_state:
    st.session_state.tracker_filter = "all"
if 'tracker_editing_id' not in st.session_state:
    st.session_state.tracker_editing_id = None
if 'tracker_show_add_form' not in st.session_state:
    st.session_state.tracker_show_add_form = False
if 'smart_add_parsed' not in st.session_state:
    st.session_state.smart_add_parsed = None
if 'smart_add_raw_jd' not in st.session_state:
    st.session_state.smart_add_raw_jd = None
if '_newly_added_job' not in st.session_state:
    st.session_state._newly_added_job = None
if 'tracker_view' not in st.session_state:
    st.session_state.tracker_view = "table"  # "cards" or "table"
if 'tracker_sort' not in st.session_state:
    st.session_state.tracker_sort = "date_desc"
if 'skill_status_filter' not in st.session_state:
    st.session_state.skill_status_filter = "all"
if 'si_editing_job' not in st.session_state:
    st.session_state.si_editing_job = None
if 'si_view' not in st.session_state:
    st.session_state.si_view = "charts"  # "charts" or "data"


# --- Helper Functions ---
def _get_undetectable_key() -> str:
    """Get Undetectable.ai API key: user input (resume or CL) > env var."""
    return (st.session_state.get("undetectable_api_key_input", "").strip()
            or st.session_state.get("cl_undetectable_api_key_input", "").strip()
            or os.getenv("UNDETECTABLE_API_KEY", "").strip())

def auto_save_session():
    """Auto-save current session if we have enough data."""
    if (st.session_state.resume_data and 
        st.session_state.pdf_bytes and 
        st.session_state.current_session_id):
        
        # Ensure we have the latest HTML
        if not st.session_state.resume_html:
            st.session_state.resume_html = render_resume_html_for_pdf(st.session_state.resume_data)
        
        save_session(
            pdf_bytes=st.session_state.pdf_bytes,
            pdf_filename=st.session_state.pdf_filename or "resume.pdf",
            resume_data=st.session_state.resume_data,
            resume_html=st.session_state.resume_html,
            analysis_result=st.session_state.analysis_result,
            job_matches=st.session_state.job_matches,
            timeline=st.session_state.timeline,
            selected_job=st.session_state.selected_job,
            current_diff=st.session_state.current_diff,
            page=st.session_state.page,
            session_id=st.session_state.current_session_id,
            cover_letter_text=st.session_state.cover_letter_text,
            cover_letter_question=st.session_state.cover_letter_question,
            cl_timeline=st.session_state.cl_timeline,
            visitor_id=st.session_state.visitor_id,
        )


def execute_edit(new_data, message_text):
    """Execute edit operation and update state."""
    import uuid

    snapshot_before = copy.deepcopy(st.session_state.resume_data)
    new_data = copy.deepcopy(new_data)

    diff = compute_diff(snapshot_before, new_data)
    st.session_state.current_diff = diff
    st.session_state.previous_data = snapshot_before

    st.session_state.resume_data = new_data
    
    # Update HTML (source of truth) and PDF — keep PDF clean for download; preview can show diff separately
    st.session_state.resume_html = render_resume_html_for_pdf(new_data)
    st.session_state.pdf_bytes = convert_html_to_pdf(st.session_state.resume_html)
    
    # Auto-save session if we have one
    auto_save_session()
    
    entry = {
        "id": str(uuid.uuid4()),
        "role": "assistant",
        "type": "edit",
        "content": message_text,
        "meta": {
            "snapshot_before": snapshot_before,
            "data_applied": copy.deepcopy(new_data),
            "diff": diff
        },
        "is_reverted": False
    }
    st.session_state.timeline.append(entry)


# --- Sidebar ---
with st.sidebar:
    if st.button("🚀 CareerOps Pro", key="sidebar_home_title", use_container_width=True):
        st.session_state.page = "home"
        st.rerun()
    st.caption("AI-Powered Resume Platform")
    
    st.divider()
    
    model = st.selectbox("🧠 Brain", ["gpt-5.2", "gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet-20241022"])
    _env_key = os.getenv("OPENAI_API_KEY", "")
    _user_key = st.text_input("🔑 API Key (optional)", value="", type="password",
                              help="Leave blank to use the built-in demo key, or enter your own")
    api_key = (_user_key or _env_key or "").strip()
    if _user_key.strip():
        st.caption("🔑 Using your key")
    elif _env_key:
        st.caption("✅ Demo key active — ready to go")

    _tour_callout(1, 4,
        "👆 Leave the API key field <b>blank</b> to use the built-in "
        "<b>GPT-5.2</b> model for free. You're also welcome to enter "
        "your own OpenAI / Anthropic / Google key if you prefer.")

    st.divider()

    uploaded_file = st.file_uploader("📄 Upload Resume (PDF)", type="pdf")

    _tour_callout(2, 4,
        "👆 <b>Upload your resume PDF</b> here. "
        "The AI will use Vision to parse every section automatically. "
        "Then click <b>🔍 Analyze Resume</b> below.")
    
    if uploaded_file and api_key:
        if st.button("🔍 Analyze Resume", type="primary", use_container_width=True):
            with st.spinner("Processing your resume with Vision AI..."):
                uploaded_file.seek(0)
                pdf_bytes = uploaded_file.read()
                st.session_state.pdf_bytes = pdf_bytes
                st.session_state.pdf_filename = uploaded_file.name
                
                # Always use Vision mode for better accuracy
                st.info("🔍 Using Vision AI for accurate parsing...")
                parse_result = parse_resume_from_image(pdf_bytes, api_key, model=model)
                if parse_result.get("success"):
                    st.session_state.raw_text = parse_result.get("raw_text", "")
                
                if parse_result.get("success"):
                    st.session_state.resume_data = parse_result["data"]

                    analysis = analyze_resume(parse_result["data"], model, api_key)
                    if analysis["success"]:
                        st.session_state.analysis_result = analysis["analysis"]

                    matches = match_jobs(parse_result["data"], model, api_key)
                    if matches["success"]:
                        st.session_state.job_matches = matches
                    else:
                        print(f"[DEBUG] match_jobs failed: {matches.get('error', 'unknown')}")
                        st.session_state.job_matches = None

                    st.session_state.page = "analysis"
                    st.session_state.timeline = []
                    st.session_state.selected_job = None
                    st.session_state.current_session_id = None  # New session, not saved yet
                    st.rerun()
                else:
                    st.error(f"❌ Failed to parse resume: {parse_result.get('error', 'Unknown error')}")
                    st.stop()
    
    # ========== SAVE SESSION BUTTON ==========
    if st.session_state.resume_data and st.session_state.pdf_bytes:
        st.divider()
        if st.button("💾 Save Session", use_container_width=True):
            # Ensure we have the latest HTML
            if not st.session_state.resume_html:
                st.session_state.resume_html = render_resume_html_for_pdf(st.session_state.resume_data)
            
            session_id = save_session(
                pdf_bytes=st.session_state.pdf_bytes,
                pdf_filename=st.session_state.pdf_filename or "resume.pdf",
                resume_data=st.session_state.resume_data,
                resume_html=st.session_state.resume_html,
                analysis_result=st.session_state.analysis_result,
                job_matches=st.session_state.job_matches,
                timeline=st.session_state.timeline,
                selected_job=st.session_state.selected_job,
                current_diff=st.session_state.current_diff,
                page=st.session_state.page,
                session_id=st.session_state.current_session_id,
                visitor_id=st.session_state.visitor_id,
            )
            st.session_state.current_session_id = session_id
            st.success(f"✅ Session saved!")
            st.rerun()
        
        if st.session_state.current_session_id:
            st.caption(f"📍 Session: {st.session_state.current_session_id}")
    
    # Navigation
    if st.session_state.resume_data:
        st.divider()
        st.subheader("📍 Navigation")
        _tour_callout(4, 4,
            "🎉 <b>You're all set!</b> Use these buttons to navigate between tools. "
            "After selecting a job, <b>Editor</b>, <b>Cover Letter</b>, and <b>Mock Interview</b> "
            "will appear here. <b>Job Tracker</b> and <b>Skill Insights</b> are always available below.")

        if st.button("🏠 Home", use_container_width=True,
                     type="primary" if st.session_state.page == "home" else "secondary"):
            st.session_state.page = "home"
            st.rerun()

        if st.button("📊 Resume Analysis", use_container_width=True,
                     type="primary" if st.session_state.page == "analysis" else "secondary"):
            st.session_state.page = "analysis"
            st.rerun()
        
        if st.session_state.selected_job:
            if st.button("✏️ Resume Editor", use_container_width=True,
                         type="primary" if st.session_state.page == "editor" else "secondary"):
                st.session_state.page = "editor"
                st.rerun()
            
            if st.button("📝 Cover Letter", use_container_width=True,
                         type="primary" if st.session_state.page == "cover_letter" else "secondary"):
                st.session_state.page = "cover_letter"
                st.rerun()

            if st.button("🎙️ Mock Interview", use_container_width=True,
                         type="primary" if st.session_state.page == "interview" else "secondary"):
                st.session_state.page = "interview"
                st.rerun()

    # Job Tracker & Skill Insights — always accessible (not gated on resume_data)
    st.divider()
    if st.button("📋 Job Tracker", use_container_width=True,
                 type="primary" if st.session_state.page == "job_tracker" else "secondary"):
        st.session_state.page = "job_tracker"
        st.rerun()
    if st.button("📊 Skill Insights", use_container_width=True,
                 type="primary" if st.session_state.page == "skill_insights" else "secondary"):
        st.session_state.page = "skill_insights"
        st.rerun()


# --- Main Content ---

# ========== WELCOME / SAVED SESSIONS PAGE ==========
if (not st.session_state.resume_data and st.session_state.page not in ("job_tracker", "skill_insights")) or st.session_state.page == "home":
    st.markdown("""
        <div style="text-align: center; padding: 40px 0;">
            <h1>🚀 Welcome to CareerOps Pro</h1>
            <p style="font-size: 1.2rem; color: #64748b;">AI-Powered Resume Analysis & Optimization Platform</p>
        </div>
    """, unsafe_allow_html=True)

    st.markdown("""
    <div style="background: linear-gradient(135deg, #1e293b, #334155); border-radius: 12px;
                padding: 20px 28px; margin: 0 auto 24px; max-width: 720px;
                border: 1px solid #475569; color: #e2e8f0;">
        <p style="margin:0 0 8px; font-size:0.95rem;">
            <strong>📌 About This Project</strong>
        </p>
        <p style="margin:0 0 10px; font-size:0.85rem; color:#94a3b8; line-height:1.7;">
            This app is for <strong style="color:#fbbf24;">demonstration purposes</strong>.
            Data is stored per-browser and may reset.
        </p>
        <p style="margin:0 0 12px; font-size:1.05rem; color:#f87171; font-weight:700;
                  text-transform:uppercase; letter-spacing:0.5px;">
            ⚠️ WE ARE NOT RESPONSIBLE FOR DATA LOSS
        </p>
        <p style="margin:0 0 0; font-size:0.85rem; color:#94a3b8; line-height:1.7;">
            🔬 <strong style="color:#e2e8f0;">Multi-LLM Review</strong> — under development (Next.js + WebSocket)<br>
            🎤 <strong style="color:#e2e8f0;">Mock Interview</strong> — in beta<br>
            Frontend is currently undergoing a refactor, migrating from Streamlit to <strong style="color:#38bdf8;">Next.js</strong>
        </p>
        <hr style="border:none; border-top:1px solid #475569; margin:16px 0 12px;">
        <p style="margin:0; font-size:0.85rem; color:#94a3b8;">
            Built by <strong style="color:#e2e8f0;">Ruoping Gao</strong>
            · <a href="https://github.com/RGAO002/CareerOps-Pro" target="_blank"
                 style="color:#38bdf8; text-decoration:none;">GitHub ↗</a>
        </p>
    </div>
    """, unsafe_allow_html=True)

    # ── Guided Tour trigger ──────────────────────────────────
    _tour_col1, _tour_col2, _tour_col3 = st.columns([1, 1, 1])
    with _tour_col2:
        if st.button("🗺️ Take a Tour", use_container_width=True, type="primary"):
            st.session_state.tour_step = 1
            st.rerun()

    # Ensure demo session always exists on cloud (re-creates if deleted)
    if os.environ.get("SPACE_ID"):
        ensure_demo_session()

    # Show saved sessions
    saved_sessions = list_sessions(visitor_id=st.session_state.visitor_id)
    
    if saved_sessions:
        st.markdown("## 📂 Your Saved Sessions")
        st.markdown("Click on a session to restore your previous work.")
        st.markdown("---")
        
        # Display sessions in a grid (3 columns)
        cols = st.columns(3)
        
        for idx, session in enumerate(saved_sessions):
            session_id = session["id"]
            col = cols[idx % 3]
            
            with col:
                # Thumbnail (larger)
                thumb_path = get_thumbnail_path(session_id)
                if thumb_path.exists():
                    st.image(str(thumb_path), use_container_width=True)
                else:
                    st.info("📄 No preview")
                
                # Session info
                display_name = session.get("name", "Unknown")
                pdf_filename = session.get("pdf_filename", "resume.pdf")
                updated_at = session.get("updated_at", "")
                
                # Session name — inline rename
                is_renaming = st.session_state.get("renaming_session") == session_id
                if is_renaming:
                    rc1, rc2 = st.columns([5, 1])
                    with rc1:
                        new_name = st.text_input("Rename", value=display_name, key=f"rename_input_{session_id}", label_visibility="collapsed")
                    with rc2:
                        if st.button("✓", key=f"rename_save_{session_id}", use_container_width=True):
                            if new_name.strip():
                                rename_session(session_id, new_name.strip())
                            st.session_state.renaming_session = None
                            st.rerun()
                else:
                    nc1, nc2 = st.columns([5, 1])
                    with nc1:
                        st.markdown(f"**{display_name}**")
                    with nc2:
                        if st.button("✏️", key=f"rename_btn_{session_id}", use_container_width=True):
                            st.session_state.renaming_session = session_id
                            st.rerun()

                st.caption(f"📄 {pdf_filename}")
                st.caption(f"🕒 {updated_at}")

                # Action buttons
                btn_col1, btn_col2 = st.columns(2)
                with btn_col1:
                    if st.button("📥 Restore", key=f"main_restore_{session_id}", use_container_width=True):
                        loaded = load_session(session_id)
                        if loaded:
                            st.session_state.pdf_bytes = loaded.get("pdf_bytes")
                            st.session_state.pdf_filename = loaded.get("pdf_filename")
                            st.session_state.resume_data = loaded.get("resume_data")
                            st.session_state.resume_html = loaded.get("resume_html")
                            st.session_state.analysis_result = loaded.get("analysis_result")
                            st.session_state.job_matches = loaded.get("job_matches")
                            st.session_state.timeline = loaded.get("timeline", [])
                            st.session_state.selected_job = loaded.get("selected_job")
                            st.session_state.current_diff = loaded.get("current_diff", {})
                            st.session_state.page = loaded.get("page", "analysis")
                            st.session_state.current_session_id = session_id
                            st.session_state.cover_letter_text = loaded.get("cover_letter_text", "")
                            st.session_state.cover_letter_question = loaded.get("cover_letter_question", "")
                            st.session_state.cl_timeline = loaded.get("cl_timeline", [])
                            st.rerun()

                with btn_col2:
                    if st.button("🗑️ Delete", key=f"main_delete_{session_id}", use_container_width=True):
                        delete_session(session_id, visitor_id=st.session_state.visitor_id)
                        st.rerun()
                
                st.markdown("---")
    else:
        # No saved sessions - show instructions
        st.markdown("""
            <div style="
                text-align: center; 
                padding: 60px 40px;
                background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                border-radius: 16px;
                margin: 40px 0;
            ">
                <div style="font-size: 4rem; margin-bottom: 20px;">📄</div>
                <h3>Get Started</h3>
                <p style="color: #64748b; max-width: 400px; margin: 0 auto;">
                    Upload your resume PDF in the sidebar to begin analyzing and optimizing your resume with AI.
                </p>
            </div>
        """, unsafe_allow_html=True)

elif st.session_state.page == "analysis" and st.session_state.resume_data:
    # Auto-advance tour: user just analyzed their resume
    if st.session_state.tour_step in (1, 2):
        st.session_state.tour_step = 3
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
    
    # Custom JD Section
    st.divider()
    st.markdown("## ✨ Tailor Resume with Custom JD")
    st.caption("Paste a job description URL or text to get personalized resume suggestions")
    
    # Initialize custom job state
    if 'custom_job' not in st.session_state:
        st.session_state.custom_job = None
    
    if st.session_state.get("jd_error"):
        st.error(f"❌ {st.session_state.jd_error}")
        st.session_state.jd_error = None
    
    with st.expander("📝 Enter Job Description", expanded=st.session_state.custom_job is None):
        jd_input = st.text_area(
            "Paste JD URL or text",
            height=150,
            placeholder="Paste a job posting URL (e.g., https://linkedin.com/jobs/...) or paste the full job description text here...",
            help="You can paste a URL to a job posting or copy-paste the entire job description text"
        )
        
        col_parse, col_clear = st.columns([1, 1])
        with col_parse:
            if st.button("🔍 Analyze JD", type="primary", use_container_width=True, disabled=not jd_input):
                with st.spinner("Analyzing job description..."):
                    result = parse_custom_jd(jd_input, st.session_state.resume_data, model, api_key)
                    if result["success"]:
                        st.session_state.custom_job = result["job"]
                        st.session_state.jd_error = None
                        if result.get("warning"):
                            st.warning(f"⚠️ {result['warning']}")
                        else:
                            st.success("✅ JD analyzed successfully!")
                        st.rerun()
                    else:
                        st.session_state.custom_job = None
                        st.session_state.jd_error = result['error']
                        st.rerun()
        
        with col_clear:
            if st.session_state.custom_job and st.button("🗑️ Clear", use_container_width=True):
                st.session_state.custom_job = None
                st.rerun()
    
    # Display custom job card if available
    if st.session_state.custom_job:
        job = st.session_state.custom_job
        score = job.get("match_score", 0)
        score_class = "" if score >= 80 else "medium" if score >= 60 else "low"
        
        st.markdown(f"""
            <div class="job-card" style="border: 2px solid #667eea;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="font-size: 0.75rem; color: #667eea; font-weight: 600; margin-bottom: 5px;">📌 CUSTOM JD</div>
                        <div class="job-title">{job.get('title', 'Unknown Position')}</div>
                        <div class="job-company">{job.get('company', 'Unknown Company')} • {job.get('location', 'Not specified')}</div>
                    </div>
                    <div class="match-score {score_class}">{score}% Match</div>
                </div>
                <div class="job-meta">
                    <span>💰 {job.get('salary', 'Not specified')}</span>
                    <span>📋 {job.get('type', 'Full-time')}</span>
                    <span>🏷️ {job.get('category', 'Other')}</span>
                </div>
                <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 10px;">{job.get('description', '')[:200]}...</p>
            </div>
        """, unsafe_allow_html=True)
        
        col_a, col_b = st.columns([3, 1])
        with col_a:
            with st.expander("View Details", expanded=True):
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
                
                if job.get("tailoring_tips"):
                    st.markdown("**Tailoring Tips:**")
                    for tip in job.get("tailoring_tips", []):
                        st.markdown(f"💡 {tip}")
        
        with col_b:
            if st.button("✨ Tailor Resume", key="tailor_custom", type="primary"):
                st.session_state.selected_job = job
                st.session_state.page = "editor"
                st.session_state.timeline = []
                st.session_state.cover_letter_text = ""
                st.session_state.cover_letter_question = ""
                st.session_state.cl_timeline = []

                html = render_resume_html(st.session_state.resume_data)
                st.session_state.pdf_bytes = convert_html_to_pdf(html)
                st.session_state.current_diff = {}
                # Auto-advance tour
                if st.session_state.tour_step == 3:
                    st.session_state.tour_step = 4
                st.rerun()
            if st.button("📋 Track", key="track_custom"):
                tracker_import(
                    session_id=st.session_state.current_session_id or "unsaved",
                    selected_job=job,
                    status="applied",
                    visitor_id=st.session_state.visitor_id,
                )
                st.toast("✅ Added to Job Tracker!")

    # Job Matching
    if matches:
        st.divider()
        st.markdown("## 🎯 Best Matching Jobs")
        if st.session_state.tour_step == 3:
            st.markdown("""
            <div class="tour-callout" style="margin-bottom:12px;">
                <span class="tour-step-badge">Step 3 / 4</span>
                <p class="tour-text">👇 <b>Click any job card</b> below to select it.
                This unlocks the <b>Resume Editor</b>, <b>Cover Letter</b>, and <b>Mock Interview</b> tools
                — all tailored to that specific job.</p>
            </div>
            """, unsafe_allow_html=True)
            _tc1, _tc2 = st.columns(2)
            with _tc1:
                if st.button("Skip Tour", key="tour_skip_3", use_container_width=True):
                    st.session_state.tour_step = 0
                    st.rerun()
            with _tc2:
                if st.button("Next →", key="tour_next_3", type="primary", use_container_width=True):
                    st.session_state.tour_step = 4
                    st.rerun()
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
                        st.session_state.cover_letter_text = ""
                        st.session_state.cover_letter_question = ""
                        st.session_state.cl_timeline = []

                        html = render_resume_html(st.session_state.resume_data)
                        st.session_state.pdf_bytes = convert_html_to_pdf(html)
                        st.session_state.current_diff = {}
                        # Auto-advance tour
                        if st.session_state.tour_step == 3:
                            st.session_state.tour_step = 4
                        st.rerun()
                    if st.button("📋 Track", key=f"track_{job.get('id')}"):
                        tracker_import(
                            session_id=st.session_state.current_session_id or "unsaved",
                            selected_job=job,
                            status="applied",
                            visitor_id=st.session_state.visitor_id,
                        )
                        st.toast("✅ Added to Job Tracker!")

elif st.session_state.page == "editor" and st.session_state.resume_data:
    # ============== Editor Page ==============
    import uuid
    
    if st.session_state.selected_job:
        job = st.session_state.selected_job
        score = job.get("match_score")
        score_class = "" if (score is None or score >= 80) else "medium" if score >= 60 else "low"
        score_html = ""
        if score is not None:
            score_html = f'<div class="match-score {score_class}">{score}% Match</div>'
        job_display = job.get('title') if job.get('company', '').lower() in job.get('title', '').lower() else job.get('title') + ' @ ' + job.get('company', '')
        st.markdown(f"""
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        padding: 15px 20px; border-radius: 10px; color: white; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 0.85rem; opacity: 0.9;">Tailoring Resume For:</div>
                        <div style="font-size: 1.3rem; font-weight: 700;">{job_display}</div>
                    </div>
                    {score_html}
                </div>
            </div>
        """, unsafe_allow_html=True)
    
    # One-click tailor + settings + debate + track
    opt_col1, opt_col2, opt_col_debate, opt_col3 = st.columns([2, 5, 1.2, 1])
    with opt_col1:
        if st.button("⚡ One-click Tailor", type="primary"):
            if not st.session_state.selected_job:
                st.warning("Please select a job first.")
            else:
                st.session_state.trigger_action = {
                    "type": "start_tailor",
                    "payload": st.session_state.get("tailor_custom_instructions", "")
                }
                st.rerun()
    with opt_col2:
        with st.expander("⚙️ Tailor & Humanize Settings"):
            st.text_area(
                "Custom tailor instructions (optional)",
                placeholder="e.g., Emphasize leadership experience, highlight cloud skills...",
                height=160,
                key="tailor_custom_instructions"
            )
            st.checkbox("Auto-humanize after tailor", key="auto_humanize", value=False)
            st.divider()
            st.caption("🔒 Humanize Settings")
            st.markdown(
                "Powered by [**Undetectable.ai**](https://undetectable.ai) — "
                "rewrites AI-generated text to sound more natural and bypass AI detectors. "
                "Enter your API key below, or set `UNDETECTABLE_API_KEY` in `.env`."
            )
            st.text_input(
                "🔑 Undetectable.ai API Key",
                type="password",
                key="undetectable_api_key_input",
                placeholder="Paste your Undetectable.ai API key here",
            )
            h_s_col1, h_s_col2 = st.columns(2)
            with h_s_col1:
                st.selectbox("Strength", ["Quality", "Balanced", "More Human"], index=2, key="humanize_strength")
                st.selectbox("Model", ["v11", "v11sr", "v2"], index=0, key="humanize_model",
                             help="v11: English-optimized | v11sr: Best English, slower | v2: Multilingual")
            with h_s_col2:
                st.selectbox("Readability", ["High School", "University", "Doctorate", "Journalist", "Marketing"], index=3, key="humanize_readability")
            st.multiselect("Sections to humanize", ["summary", "experience", "projects"], default=["summary", "experience", "projects"], key="humanize_sections")
            # Show credits
            _ukey = _get_undetectable_key()
            if _ukey:
                try:
                    _credits = check_credits(_ukey)
                    st.caption(f"💰 Credits: {_credits.get('credits', 'N/A')}")
                except Exception:
                    st.caption("💰 Credits: unable to check")
            st.divider()
            if st.button("🔒 Humanize Resume Text", type="secondary", use_container_width=True):
                if not _get_undetectable_key():
                    st.warning("Please enter your Undetectable.ai API key above, or set UNDETECTABLE_API_KEY in .env.")
                elif not st.session_state.resume_data:
                    st.warning("No resume loaded.")
                else:
                    st.session_state.trigger_action = {
                        "type": "start_humanize",
                        "payload": {
                            "strength": st.session_state.get("humanize_strength", "More Human"),
                            "model": st.session_state.get("humanize_model", "v11"),
                            "readability": st.session_state.get("humanize_readability", "Journalist"),
                            "purpose": "General Writing",
                            "sections": st.session_state.get("humanize_sections", ["summary", "experience", "projects"]),
                        }
                    }
                    st.rerun()
    @st.dialog("🔬 Multi-LLM Review (Debate)")
    def _show_debate_wip():
        st.markdown(
            "Two AI models **independently draft** your resume section, "
            "**cross-review** each other's work, then produce final versions "
            "— you pick the best one in a **blind comparison**."
        )
        st.markdown("---")
        st.markdown(
            "🚧 &nbsp; **Under development** — the Next.js + WebSocket "
            "frontend for this feature is being built. Stay tuned!"
        )
        if st.button("OK", use_container_width=True):
            st.rerun()

    with opt_col_debate:
        if st.button("🤖 Debate", key="editor_debate", use_container_width=True,
                      help="Multi-LLM Review: have two AI models debate and refine your resume"):
            _show_debate_wip()
    with opt_col3:
        if st.session_state.selected_job:
            if st.button("📋 Track", key="editor_track_job", use_container_width=True):
                tracker_import(
                    session_id=st.session_state.current_session_id or "unsaved",
                    selected_job=st.session_state.selected_job,
                    status="applied",
                    visitor_id=st.session_state.visitor_id,
                )
                st.toast("✅ Added to Job Tracker!")
    
    # Initialize edit mode
    if 'edit_mode' not in st.session_state:
        st.session_state.edit_mode = False
    
    # ========== Maintain HTML as source of truth ==========
    # Generate/update HTML whenever resume_data changes; PDF only in preview mode
    import hashlib
    _diff = st.session_state.current_diff or {}
    _diff_str = str(_diff) if _diff else ""
    data_hash = hashlib.md5((str(st.session_state.resume_data) + _diff_str).encode()).hexdigest()[:8]

    if 'resume_html_hash' not in st.session_state or st.session_state.resume_html_hash != data_hash:
        st.session_state.resume_html = render_resume_html_for_pdf(st.session_state.resume_data)
        st.session_state.resume_html_hash = data_hash
        # Defer PDF generation — only when preview mode actually needs it
        st.session_state.pdf_bytes = None

    # Generate PDF only in preview mode, and only if not already cached
    if not st.session_state.edit_mode and st.session_state.pdf_bytes is None:
        st.session_state.pdf_bytes = convert_html_to_pdf(st.session_state.resume_html)
    
    col_preview, col_chat = st.columns([1.3, 1])
    
    with col_preview:
        st.markdown("### 📄 Resume Preview")
        
        # Toolbar
        tool_col1, tool_col2, tool_col3 = st.columns([1, 1, 2])
        with tool_col1:
            if st.session_state.pdf_bytes:
                st.download_button(
                    "⬇️ Download PDF", 
                    st.session_state.pdf_bytes, 
                    file_name="resume.pdf", 
                    mime="application/pdf",
                    key=f"download_pdf_{data_hash}"
                )
        with tool_col2:
            if st.button("✏️ Edit Mode" if not st.session_state.edit_mode else "👁️ Preview Mode"):
                st.session_state.edit_mode = not st.session_state.edit_mode
                st.rerun()
        with tool_col3:
            new_show_diff = st.toggle("Diff", value=st.session_state.show_diff)
            if new_show_diff != st.session_state.show_diff:
                st.session_state.show_diff = new_show_diff
                st.rerun()
        
        if st.session_state.edit_mode:
            # ========== EDIT MODE: Streamlit Forms ==========
            st.markdown("---")
            st.caption("📝 Edit fields below. Click ➕ to add, 🗑️ to delete.")
            
            data = st.session_state.resume_data
            changed = False
            
            # Basic Info (Name, Role, Contact)
            with st.expander("👤 Basic Info", expanded=True):
                new_name = st.text_input("Name", value=data.get("name", ""), key="edit_name")
                new_role = st.text_input("Role/Title", value=data.get("role", ""), key="edit_role")
                if new_name != data.get("name"):
                    data["name"] = new_name
                    changed = True
                if new_role != data.get("role"):
                    data["role"] = new_role
                    changed = True
                
                # Contact items
                st.markdown("**Contact Info**")
                contacts = data.get("contact", [])
                contacts_to_delete = []
                for i, contact in enumerate(contacts):
                    col_input, col_del = st.columns([5, 1])
                    with col_input:
                        new_contact = st.text_input(f"Item {i+1}", value=contact, key=f"edit_contact_{i}", label_visibility="collapsed")
                        if new_contact != contact:
                            data["contact"][i] = new_contact
                            changed = True
                    with col_del:
                        if st.button("🗑️", key=f"del_contact_{i}", help="Delete this contact"):
                            contacts_to_delete.append(i)
                
                # Delete contacts (reverse order to preserve indices)
                for i in reversed(contacts_to_delete):
                    data["contact"].pop(i)
                    changed = True
                
                # Add new contact
                if st.button("➕ Add Contact", key="add_contact"):
                    if "contact" not in data:
                        data["contact"] = []
                    data["contact"].append("")
                    changed = True
            
            # Summary
            with st.expander("📝 Summary", expanded=True):
                new_summary = st.text_area("Profile Summary", value=data.get("summary", ""), height=150, key="edit_summary")
                if new_summary != data.get("summary"):
                    data["summary"] = new_summary
                    changed = True
            
            # Skills (with editable category names)
            with st.expander("🛠️ Skills", expanded=False):
                skills = data.get("skills", {})
                new_skills = {}
                cats_to_delete = []
                
                for idx, (cat, items) in enumerate(skills.items()):
                    col_cat, col_del = st.columns([5, 1])
                    with col_cat:
                        new_cat = st.text_input("Category", value=cat, key=f"edit_skill_cat_{idx}")
                    with col_del:
                        if st.button("🗑️", key=f"del_skill_cat_{idx}", help="Delete this category"):
                            cats_to_delete.append(cat)
                            continue
                    
                    if cat not in cats_to_delete:
                        new_items = st.text_input("Skills (comma-separated)", value=items, key=f"edit_skill_items_{idx}", label_visibility="collapsed")
                        # Use new category name
                        final_cat = new_cat if new_cat else cat
                        new_skills[final_cat] = new_items
                
                # Check if skills changed
                if new_skills != skills or cats_to_delete:
                    data["skills"] = new_skills
                    changed = True
                
                # Add new skill category
                if st.button("➕ Add Skill Category", key="add_skill_cat"):
                    new_cat_name = f"New Category {len(data.get('skills', {})) + 1}"
                    if "skills" not in data:
                        data["skills"] = {}
                    data["skills"][new_cat_name] = ""
                    changed = True
            
            # Experience
            with st.expander("💼 Experience", expanded=False):
                for i, exp in enumerate(data.get("experience", [])):
                    st.markdown(f"**{exp.get('company', 'Company')}**")
                    new_company = st.text_input("Company", value=exp.get("company", ""), key=f"edit_exp_company_{i}")
                    new_exp_role = st.text_input("Role", value=exp.get("role", ""), key=f"edit_exp_role_{i}")
                    new_date = st.text_input("Date", value=exp.get("date", ""), key=f"edit_exp_date_{i}")
                    
                    if new_company != exp.get("company"):
                        data["experience"][i]["company"] = new_company
                        changed = True
                    if new_exp_role != exp.get("role"):
                        data["experience"][i]["role"] = new_exp_role
                        changed = True
                    if new_date != exp.get("date"):
                        data["experience"][i]["date"] = new_date
                        changed = True
                    
                    # Bullets with add/delete
                    st.markdown("*Bullet Points:*")
                    bullets = exp.get("bullets", [])
                    bullets_to_delete = []
                    for j, bullet in enumerate(bullets):
                        col_bullet, col_del = st.columns([5, 1])
                        with col_bullet:
                            new_bullet = st.text_area(f"Bullet {j+1}", value=bullet, height=80, key=f"edit_exp_bullet_{i}_{j}", label_visibility="collapsed")
                            if new_bullet != bullet:
                                data["experience"][i]["bullets"][j] = new_bullet
                                changed = True
                        with col_del:
                            if st.button("🗑️", key=f"del_exp_bullet_{i}_{j}"):
                                bullets_to_delete.append(j)
                    
                    # Delete bullets
                    for j in reversed(bullets_to_delete):
                        data["experience"][i]["bullets"].pop(j)
                        changed = True
                    
                    # Add bullet
                    if st.button("➕ Add Bullet", key=f"add_exp_bullet_{i}"):
                        if "bullets" not in data["experience"][i]:
                            data["experience"][i]["bullets"] = []
                        data["experience"][i]["bullets"].append("")
                        changed = True
                    
                    st.markdown("---")
            
            # Projects
            with st.expander("🚀 Projects", expanded=False):
                for i, proj in enumerate(data.get("projects", [])):
                    st.markdown(f"**{proj.get('name', 'Project')}**")
                    new_proj_name = st.text_input("Project Name", value=proj.get("name", ""), key=f"edit_proj_name_{i}")
                    new_tech = st.text_input("Tech Stack", value=proj.get("tech", ""), key=f"edit_proj_tech_{i}")
                    # Links: support "links" list or legacy single "link" + "link_text"
                    proj_links = proj.get("links")
                    if not isinstance(proj_links, list) or not proj_links:
                        if proj.get("link"):
                            proj_links = [{"url": proj.get("link", ""), "text": proj.get("link_text", "")}]
                        else:
                            proj_links = []
                    new_links = []
                    links_to_delete = []
                    for j, lnk in enumerate(proj_links):
                        if not isinstance(lnk, dict):
                            continue
                        st.markdown(f"*Link {j + 1}*")
                        c1, c2, c3 = st.columns([3, 2, 1])
                        with c1:
                            new_url = st.text_input("URL", value=lnk.get("url", ""), key=f"edit_proj_link_url_{i}_{j}", label_visibility="collapsed", placeholder="https://...")
                        with c2:
                            new_text = st.text_input("Text (optional)", value=lnk.get("text", ""), key=f"edit_proj_link_text_{i}_{j}", label_visibility="collapsed", placeholder="e.g. GitHub Repo — empty = show URL")
                        with c3:
                            if st.button("🗑️", key=f"del_proj_link_{i}_{j}"):
                                links_to_delete.append(j)
                        if j not in links_to_delete:
                            new_links.append({"url": new_url, "text": new_text})
                    if st.button("➕ Add Link", key=f"add_proj_link_{i}"):
                        # New list to avoid reference sharing; don't mutate dict with del
                        data["projects"][i]["links"] = [{"url": e.get("url", ""), "text": e.get("text", "")} for e in new_links] + [{"url": "", "text": ""}]
                        changed = True
                    elif links_to_delete or new_links != proj_links:
                        data["projects"][i]["links"] = [{"url": e.get("url", ""), "text": e.get("text", "")} for e in new_links]
                        changed = True
                        if links_to_delete:
                            st.rerun()
                    
                    if new_proj_name != proj.get("name"):
                        data["projects"][i]["name"] = new_proj_name
                        changed = True
                    if new_tech != proj.get("tech"):
                        data["projects"][i]["tech"] = new_tech
                        changed = True
                    
                    # Bullets with add/delete
                    st.markdown("*Bullet Points:*")
                    bullets = proj.get("bullets", [])
                    bullets_to_delete = []
                    for j, bullet in enumerate(bullets):
                        col_bullet, col_del = st.columns([5, 1])
                        with col_bullet:
                            new_bullet = st.text_area(f"Bullet {j+1}", value=bullet, height=80, key=f"edit_proj_bullet_{i}_{j}", label_visibility="collapsed")
                            if new_bullet != bullet:
                                data["projects"][i]["bullets"][j] = new_bullet
                                changed = True
                        with col_del:
                            if st.button("🗑️", key=f"del_proj_bullet_{i}_{j}"):
                                bullets_to_delete.append(j)
                    
                    # Delete bullets
                    for j in reversed(bullets_to_delete):
                        data["projects"][i]["bullets"].pop(j)
                        changed = True
                    
                    # Add bullet
                    if st.button("➕ Add Bullet", key=f"add_proj_bullet_{i}"):
                        if "bullets" not in data["projects"][i]:
                            data["projects"][i]["bullets"] = []
                        data["projects"][i]["bullets"].append("")
                        changed = True
                    
                    st.markdown("---")
            
            # Education
            with st.expander("🎓 Education", expanded=False):
                for i, edu in enumerate(data.get("education", [])):
                    st.markdown(f"**{edu.get('school', 'School')}**")
                    new_school = st.text_input("School", value=edu.get("school", ""), key=f"edit_edu_school_{i}")
                    new_degree = st.text_input("Degree", value=edu.get("degree", ""), key=f"edit_edu_degree_{i}")
                    new_edu_date = st.text_input("Date", value=edu.get("date", ""), key=f"edit_edu_date_{i}")
                    new_gpa = st.text_input("GPA", value=edu.get("gpa", ""), key=f"edit_edu_gpa_{i}")
                    
                    if new_school != edu.get("school"):
                        data["education"][i]["school"] = new_school
                        changed = True
                    if new_degree != edu.get("degree"):
                        data["education"][i]["degree"] = new_degree
                        changed = True
                    if new_edu_date != edu.get("date"):
                        data["education"][i]["date"] = new_edu_date
                        changed = True
                    if new_gpa != edu.get("gpa", ""):
                        data["education"][i]["gpa"] = new_gpa
                        changed = True
                    st.markdown("---")
            
            if changed:
                st.session_state.resume_data = copy.deepcopy(data)
                # Update HTML; defer PDF generation to preview mode to avoid malloc crashes
                st.session_state.resume_html = render_resume_html_for_pdf(st.session_state.resume_data)
                st.session_state.resume_html_hash = None  # Force PDF regen when switching to preview
                auto_save_session()
                st.rerun()
        
        else:
            # ========== PREVIEW MODE: PDF Display ==========
            # Preview: when diff on, show PDF with highlights; when off, show clean PDF.
            # Download (above) always uses st.session_state.pdf_bytes = clean PDF.
            if st.session_state.show_diff and st.session_state.current_diff:
                preview_html = render_resume_html(
                    st.session_state.resume_data,
                    diff=st.session_state.current_diff,
                    show_diff=True,
                    editable=False
                )
                preview_pdf = convert_html_to_pdf(preview_html)
            else:
                preview_pdf = st.session_state.pdf_bytes

            if preview_pdf:
                import base64
                pdf_base64 = base64.b64encode(preview_pdf).decode("utf-8")
                pdf_display = f'''
                <iframe
                    src="data:application/pdf;base64,{pdf_base64}"
                    width="100%"
                    height="800px"
                    style="border: 1px solid #e5e7eb; border-radius: 8px;"
                ></iframe>
                '''
                st.markdown(pdf_display, unsafe_allow_html=True)
            else:
                st.warning("PDF preview unavailable. Try refreshing the page.")
    
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
                        st.session_state.resume_data = copy.deepcopy(item['meta']['snapshot_before'])
                        item['is_reverted'] = True
                        st.session_state.current_diff = {}
                        st.session_state.resume_html_hash = None
                        auto_save_session()
                        break
                st.rerun()
            elif action['type'] == "redo":
                for item in st.session_state.timeline:
                    if item['id'] == action['payload']:
                        st.session_state.resume_data = copy.deepcopy(item['meta']['data_applied'])
                        item['is_reverted'] = False
                        diff = item['meta'].get('diff', {})
                        st.session_state.current_diff = diff
                        st.session_state.resume_html_hash = None
                        auto_save_session()
                        break
                st.rerun()

            elif action['type'] == "start_tailor":
                user_instructions = action['payload']
                job = st.session_state.selected_job

                snapshot_before = copy.deepcopy(st.session_state.resume_data)

                sections_to_tailor = ["summary", "skills", "experience", "projects"]
                section_labels = {
                    "summary": "📝 Profile Summary",
                    "skills": "🛠️ Technical Skills",
                    "experience": "💼 Work Experience",
                    "projects": "🚀 Projects"
                }

                tailor_entry = {
                    "id": str(uuid.uuid4()),
                    "role": "assistant",
                    "type": "tailor",
                    "content": f"One-click tailor for {job.get('title')} @ {job.get('company')}",
                    "meta": {
                        "snapshot_before": snapshot_before,
                        "sections": {}
                    },
                    "is_reverted": False
                }

                # Add user message to timeline
                st.session_state.timeline.append({
                    "id": str(uuid.uuid4()),
                    "role": "user",
                    "type": "chat",
                    "content": "One-click tailor" + (f": {user_instructions}" if user_instructions and user_instructions.strip() else ""),
                    "meta": {}
                })

                with st.status(
                    f"🔄 Tailoring resume for {job.get('title')} @ {job.get('company')}...",
                    expanded=True
                ) as status:
                    for section in sections_to_tailor:
                        label = section_labels[section]
                        st.write(f"{label} — Tailoring...")

                        section_before = copy.deepcopy(st.session_state.resume_data.get(section))

                        result = tailor_section(
                            section_name=section,
                            current_data=st.session_state.resume_data,
                            target_job=job,
                            user_instructions=user_instructions,
                            model_choice=model,
                            api_key=api_key
                        )

                        if "error" in result:
                            st.write(f"   ⚠️ {result['error']}")
                            tailor_entry["meta"]["sections"][section] = {
                                "before": section_before,
                                "after": section_before,
                                "message": f"Error: {result['error']}",
                                "reverted": False,
                                "error": True
                            }
                        else:
                            st.session_state.resume_data[section] = result["section_data"]
                            message = result.get("message", "Updated")
                            st.write(f"   ✅ {message}")
                            tailor_entry["meta"]["sections"][section] = {
                                "before": section_before,
                                "after": copy.deepcopy(result["section_data"]),
                                "message": message,
                                "reverted": False,
                                "error": False
                            }

                    status.update(label="✅ Tailoring complete!", state="complete", expanded=False)

                # Compute diff and update HTML/PDF
                diff = compute_diff(snapshot_before, st.session_state.resume_data)
                st.session_state.current_diff = diff
                st.session_state.previous_data = snapshot_before

                st.session_state.resume_html = render_resume_html_for_pdf(st.session_state.resume_data)
                # Keep PDF clean for download; preview shows diff in iframe when toggle is on
                st.session_state.pdf_bytes = convert_html_to_pdf(st.session_state.resume_html)

                st.session_state.timeline.append(tailor_entry)
                st.session_state.tailor_results = tailor_entry["id"]

                auto_save_session()

                # Auto-humanize if enabled
                if st.session_state.get("auto_humanize"):
                    undetectable_key = _get_undetectable_key()
                    if undetectable_key:
                        with st.status("🔒 Auto-humanizing AI text...", expanded=True) as h_status:
                            try:
                                h_sections = st.session_state.get("humanize_sections", ["summary", "experience", "projects"])
                                h_settings = {
                                    "strength": st.session_state.get("humanize_strength", "More Human"),
                                    "model": st.session_state.get("humanize_model", "v11"),
                                    "readability": st.session_state.get("humanize_readability", "Journalist"),
                                    "purpose": "General Writing",
                                }

                                def _auto_humanize_progress(stage, detail):
                                    st.write(f"  {detail}")

                                updated_data, warnings = humanize_resume(
                                    api_key=undetectable_key,
                                    resume_data=st.session_state.resume_data,
                                    sections=h_sections,
                                    settings=h_settings,
                                    progress_callback=_auto_humanize_progress
                                )

                                if warnings:
                                    for w in warnings:
                                        st.write(f"  ⚠️ {w}")

                                h_status.update(label="✅ Auto-humanization complete!", state="complete", expanded=False)
                                execute_edit(updated_data, "🔒 Auto-humanized AI text via Undetectable.ai")

                            except Exception as e:
                                h_status.update(label="⚠️ Auto-humanization failed", state="error", expanded=True)
                                st.warning(f"Auto-humanization failed: {str(e)}")
                    else:
                        st.warning("Auto-humanize enabled but no Undetectable.ai API key found. Enter it in ⚙️ Tailor & Humanize Settings.")

                st.rerun()

            elif action['type'] == "revert_section":
                tailor_id = action['payload']['tailor_id']
                section_name = action['payload']['section']
                for item in st.session_state.timeline:
                    if item['id'] == tailor_id and item.get('type') == 'tailor':
                        section_info = item['meta']['sections'].get(section_name)
                        if section_info and not section_info.get('reverted'):
                            st.session_state.resume_data[section_name] = copy.deepcopy(section_info['before'])
                            section_info['reverted'] = True
                            diff = compute_diff(item['meta']['snapshot_before'], st.session_state.resume_data)
                            st.session_state.current_diff = diff
                            st.session_state.resume_html_hash = None
                            auto_save_session()
                        break
                st.rerun()

            elif action['type'] == "redo_section":
                tailor_id = action['payload']['tailor_id']
                section_name = action['payload']['section']
                for item in st.session_state.timeline:
                    if item['id'] == tailor_id and item.get('type') == 'tailor':
                        section_info = item['meta']['sections'].get(section_name)
                        if section_info and section_info.get('reverted'):
                            st.session_state.resume_data[section_name] = copy.deepcopy(section_info['after'])
                            section_info['reverted'] = False
                            diff = compute_diff(item['meta']['snapshot_before'], st.session_state.resume_data)
                            st.session_state.current_diff = diff
                            st.session_state.resume_html_hash = None
                            auto_save_session()
                        break
                st.rerun()

            elif action['type'] == "revert_all_sections":
                tailor_id = action['payload']
                for item in st.session_state.timeline:
                    if item['id'] == tailor_id and item.get('type') == 'tailor':
                        st.session_state.resume_data = copy.deepcopy(item['meta']['snapshot_before'])
                        for sec_info in item['meta']['sections'].values():
                            if not sec_info.get('error'):
                                sec_info['reverted'] = True
                        st.session_state.current_diff = {}
                        st.session_state.resume_html_hash = None
                        auto_save_session()
                        break
                st.rerun()

            elif action['type'] == "start_humanize":
                settings = action['payload']
                sections = settings.pop("sections", ["summary", "experience", "projects"])
                undetectable_key = _get_undetectable_key()

                if not undetectable_key:
                    st.error("No Undetectable.ai API key found. Enter it in ⚙️ Tailor & Humanize Settings.")
                else:
                    with st.status("🔒 Humanizing AI text...", expanded=True) as status:
                        try:
                            def _humanize_progress(stage, detail):
                                st.write(f"  {detail}")

                            updated_data, warnings = humanize_resume(
                                api_key=undetectable_key,
                                resume_data=st.session_state.resume_data,
                                sections=sections,
                                settings=settings,
                                progress_callback=_humanize_progress
                            )

                            if warnings:
                                for w in warnings:
                                    st.write(f"  ⚠️ {w}")

                            status.update(label="✅ Humanization complete!", state="complete", expanded=False)

                            # Use execute_edit for automatic diff, timeline, PDF update, and revert support
                            execute_edit(updated_data, "🔒 Humanized AI text via Undetectable.ai")

                        except Exception as e:
                            status.update(label="❌ Humanization failed", state="error", expanded=True)
                            st.error(f"Humanization error: {str(e)}")

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

                        elif item['type'] == 'tailor':
                            sections = item['meta'].get('sections', {})
                            for sec_name in ["summary", "skills", "experience", "projects"]:
                                if sec_name not in sections:
                                    continue
                                sec = sections[sec_name]
                                sec_labels = {
                                    "summary": "📝 Profile Summary",
                                    "skills": "🛠️ Technical Skills",
                                    "experience": "💼 Work Experience",
                                    "projects": "🚀 Projects"
                                }
                                label = sec_labels.get(sec_name, sec_name.title())

                                if sec.get('error'):
                                    st.markdown(f"<div class='edit-log' style='border-left-color: #ef4444;'>{label}: ⚠️ {sec['message']}</div>", unsafe_allow_html=True)
                                    continue

                                c1, c2 = st.columns([4, 1])
                                if sec.get('reverted', False):
                                    c1.markdown(f"<div class='edit-log reverted-log'>{label}: ↩️ Reverted</div>", unsafe_allow_html=True)
                                    if c2.button("Redo", key=f"redo_sec_{item['id']}_{sec_name}"):
                                        st.session_state.trigger_action = {
                                            "type": "redo_section",
                                            "payload": {"tailor_id": item['id'], "section": sec_name}
                                        }
                                        st.rerun()
                                else:
                                    c1.markdown(f"<div class='edit-log'>{label}: ✅ {sec['message']}</div>", unsafe_allow_html=True)
                                    if c2.button("Revert", key=f"rev_sec_{item['id']}_{sec_name}"):
                                        st.session_state.trigger_action = {
                                            "type": "revert_section",
                                            "payload": {"tailor_id": item['id'], "section": sec_name}
                                        }
                                        st.rerun()

                            # Revert All button — show only if at least one section is not reverted
                            has_active = any(
                                not s.get('reverted') and not s.get('error')
                                for s in sections.values()
                            )
                            if has_active:
                                if st.button("↩️ Revert All", key=f"revert_all_{item['id']}"):
                                    st.session_state.trigger_action = {
                                        "type": "revert_all_sections",
                                        "payload": item['id']
                                    }
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
                <div style="font-size: 1.2rem; font-weight: 700;">{job.get('title') if job.get('company', '').lower() in job.get('title', '').lower() else job.get('title') + ' @ ' + job.get('company', '')}</div>
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

elif st.session_state.page == "job_tracker":
    # ============== Job Tracker Page ==============
    # Header row: title on left, small controls on right
    _hdr_l, _hdr_r1, _hdr_r2, _hdr_r3 = st.columns([6, 1, 1, 1])
    with _hdr_l:
        st.markdown("## 📋 Job Application Tracker")
    with _hdr_r1:
        view_icon = "📊" if st.session_state.tracker_view == "cards" else "🃏"
        if st.button(view_icon, key="toggle_view", help="Switch view", use_container_width=True):
            st.session_state.tracker_view = "cards" if st.session_state.tracker_view == "table" else "table"
            st.rerun()
    with _hdr_r2:
        with st.popover("＋", help="Add custom column"):
            st.markdown("**Add Custom Column**")
            cc_name = st.text_input("Column Name", key="new_col_name")
            cc_type = st.selectbox("Data Type", [t[0] for t in COLUMN_TYPES],
                                   format_func=lambda x: COLUMN_TYPE_LABELS[x], key="new_col_type")
            cc_options = ""
            if cc_type == "select":
                cc_options = st.text_input("Options (comma-separated)", key="new_col_opts")
            if st.button("Add Column", key="add_col_btn", use_container_width=True):
                if cc_name.strip():
                    opts = [o.strip() for o in cc_options.split(",") if o.strip()] if cc_options else []
                    add_custom_column(cc_name.strip(), cc_type, opts)
                    st.rerun()
    with _hdr_r3:
        if st.button("➕", key="add_job_toggle", help="Add new job", type="primary", use_container_width=True):
            st.session_state.tracker_show_add_form = not st.session_state.tracker_show_add_form
            st.rerun()

    # --- Status filter tabs ---
    all_jobs = get_jobs_by_status("all", visitor_id=st.session_state.visitor_id)
    tab_keys = ["all"] + [s[0] for s in STATUSES]
    tab_labels = ["All"] + [s[1] for s in STATUSES]

    filter_cols = st.columns(len(tab_labels))
    for i, (label, key) in enumerate(zip(tab_labels, tab_keys)):
        with filter_cols[i]:
            count = len([j for j in all_jobs if j["status"] == key]) if key != "all" else len(all_jobs)
            is_active = st.session_state.tracker_filter == key
            if st.button(
                f"{label} ({count})" if key == "all" else f"{label.split(' ', 1)[-1]} ({count})",
                key=f"filter_{key}",
                type="primary" if is_active else "secondary",
                use_container_width=True
            ):
                st.session_state.tracker_filter = key
                st.rerun()

    # Import sessions (small, right-aligned)
    _imp_l, _imp_r = st.columns([5, 1])
    with _imp_r:
        if st.button("📥 Import Sessions", key="import_sessions_btn", use_container_width=True):
            sessions = list_sessions(visitor_id=st.session_state.visitor_id)
            before_count = len(get_jobs_by_status("all", visitor_id=st.session_state.visitor_id))
            for sess in sessions:
                loaded = load_session(sess["id"])
                if loaded and loaded.get("selected_job"):
                    tracker_import(session_id=sess["id"], selected_job=loaded["selected_job"], status="applied", visitor_id=st.session_state.visitor_id)
            added = len(get_jobs_by_status("all", visitor_id=st.session_state.visitor_id)) - before_count
            st.toast(f"✅ Imported {added} job(s)!" if added else "ℹ️ All already tracked.")
            st.rerun()

    st.divider()

    # --- Add Job Form (Smart) ---
    if st.session_state.tracker_show_add_form:
        st.markdown("### ➕ Add New Job")

        # Section A: Smart parse (outside form so we can rerun)
        smart_input = st.text_area(
            "Paste Job URL or Description",
            placeholder="Paste a job posting URL (e.g. https://jobs.lever.co/...) or the full JD text to auto-fill fields below...",
            height=100,
            key="smart_jd_input",
        )
        _parse_col, _clear_col, _ = st.columns([1, 1, 4])
        with _parse_col:
            _has_api = bool(st.session_state.get("api_key") or os.getenv("OPENAI_API_KEY"))
            if st.button("🔍 Auto-Parse", disabled=not smart_input or not _has_api,
                         help="Parse JD to auto-fill fields" if _has_api else "Requires API key in sidebar"):
                _api = st.session_state.get("api_key") or os.getenv("OPENAI_API_KEY", "")
                _model = st.session_state.get("model_choice", "gpt-4.1-mini")
                with st.spinner("Parsing job description..."):
                    _result = parse_jd_for_tracker(smart_input, _model, _api)
                if _result["success"]:
                    st.session_state.smart_add_parsed = _result["job"]
                    st.session_state.smart_add_raw_jd = _result.get("raw_jd", "")
                    st.toast("✅ Parsed! Review the pre-filled fields below.")
                    st.rerun()
                else:
                    st.error(f"Could not parse: {_result['error']}")
        with _clear_col:
            if st.session_state.smart_add_parsed and st.button("🗑️ Clear"):
                st.session_state.smart_add_parsed = None
                st.session_state.smart_add_raw_jd = None
                st.rerun()

        # Pre-fill from parsed data
        _parsed = st.session_state.smart_add_parsed or {}
        _wt_keys = [w[0] for w in WORK_TYPES]
        _parsed_wt = _parsed.get("work_type", "")
        _wt_idx = _wt_keys.index(_parsed_wt) if _parsed_wt in _wt_keys else 0

        # Section B: Form with pre-filled fields
        with st.form("add_job_form"):
            fc1, fc2 = st.columns(2)
            with fc1:
                new_company = st.text_input("Company *", value=_parsed.get("company", ""))
                new_title = st.text_input("Job Title *", value=_parsed.get("title", ""))
                new_status = st.selectbox("Status", [s[0] for s in STATUSES],
                                          format_func=lambda x: STATUS_LABELS[x])
                new_url = st.text_input("Job URL", value=_parsed.get("url", ""))
                new_location = st.text_input("Location", value=_parsed.get("location", ""))
            with fc2:
                new_salary_min = st.text_input("Salary Min", value=_parsed.get("salary_min", ""))
                new_salary_max = st.text_input("Salary Max", value=_parsed.get("salary_max", ""))
                new_work_type = st.selectbox("Work Type", _wt_keys, index=_wt_idx,
                                              format_func=lambda x: WORK_TYPE_LABELS[x])
                new_follow_up = st.text_input("Follow-up Date (YYYY-MM-DD)")
                new_contact_name = st.text_input("Contact Name")
            new_notes = st.text_area("Notes", value=_parsed.get("description", ""), height=80)
            if st.form_submit_button("💾 Save Job", type="primary", use_container_width=True):
                if new_company and new_title:
                    contacts = [{"name": new_contact_name, "role": "", "email": ""}] if new_contact_name else []
                    entry = add_job(
                        company=new_company, title=new_title, status=new_status, url=new_url,
                        salary_min=new_salary_min, salary_max=new_salary_max,
                        notes=new_notes, contacts=contacts, follow_up_date=new_follow_up,
                        location=new_location, work_type=new_work_type,
                        requirements=_parsed.get("requirements", []),
                        visitor_id=st.session_state.visitor_id,
                    )
                    # Queue auto keyword extraction
                    st.session_state._newly_added_job = {
                        "job_id": entry["id"],
                        "requirements": _parsed.get("requirements", []),
                        "raw_jd": st.session_state.smart_add_raw_jd or "",
                    }
                    st.session_state.smart_add_parsed = None
                    st.session_state.smart_add_raw_jd = None
                    st.session_state.tracker_show_add_form = False
                    st.rerun()
                else:
                    st.error("Company and Job Title are required.")

    # --- Auto keyword extraction for newly added job ---
    if st.session_state.get("_newly_added_job"):
        _new = st.session_state._newly_added_job
        _reqs = _new.get("requirements", [])
        _raw = _new.get("raw_jd", "")
        _src = _reqs if _reqs else ([_raw] if _raw else [])
        if _src:
            _api = st.session_state.get("api_key") or os.getenv("OPENAI_API_KEY", "")
            _model = st.session_state.get("model_choice", "gpt-4.1-mini")
            if _api:
                try:
                    from services.keyword_profile import extract_keywords_llm, cache_keywords
                    _kws = extract_keywords_llm(_src, _model, _api)
                    cache_keywords(_new["job_id"], _kws)
                    st.toast(f"✅ Extracted {len(_kws)} keywords for Skill Insights")
                except Exception as _e:
                    st.toast(f"⚠️ Keyword extraction skipped: {_e}")
            else:
                try:
                    from services.keyword_profile import extract_keywords_regex, cache_keywords
                    _kws = extract_keywords_regex(_src)
                    cache_keywords(_new["job_id"], _kws)
                    st.toast(f"✅ Extracted {len(_kws)} keywords (regex) for Skill Insights")
                except Exception:
                    pass
        st.session_state._newly_added_job = None

    # --- Get data ---
    jobs = get_jobs_by_status(st.session_state.tracker_filter, visitor_id=st.session_state.visitor_id)
    custom_cols = get_custom_columns()

    if not jobs:
        st.markdown("""
            <div style="text-align: center; padding: 60px 20px; color: #94a3b8;">
                <div style="font-size: 3rem; margin-bottom: 10px;">📋</div>
                <p>No jobs found. Click <b>➕ Add Job</b> to get started.</p>
            </div>
        """, unsafe_allow_html=True)

    # ========== TABLE VIEW ==========
    elif st.session_state.tracker_view == "table":
        import pandas as pd

        # Build dataframe
        rows = []
        for job in jobs:
            row = {
                "ID": job["id"],
                "Company": job["company"],
                "Title": job["title"],
                "Status": STATUS_LABELS.get(job["status"], job["status"]),
                "Location": job.get("location", ""),
                "Work Type": WORK_TYPE_LABELS.get(job.get("work_type", ""), ""),
                "Date Applied": job.get("date_applied", ""),
                "Salary": (f"{job.get('salary_min', '')} – {job.get('salary_max', '')}"
                           if job.get("salary_min") and job.get("salary_max")
                           else job.get("salary_min", "")),
                "Follow-up": job.get("follow_up_date", ""),
                "URL": job.get("url", ""),
                "Notes": job.get("notes", ""),
            }
            # Custom columns
            cf = job.get("custom_fields", {})
            for cc in custom_cols:
                val = cf.get(cc["id"], "")
                if cc["type"] == "yes_no" and isinstance(val, bool):
                    val = "✅" if val else "❌"
                row[cc["name"]] = val if val != "" else ""
            rows.append(row)

        df = pd.DataFrame(rows)

        # Column config for st.data_editor
        col_config = {
            "ID": None,  # hide
            "Status": st.column_config.SelectboxColumn(
                "Status", options=[s[1] for s in STATUSES], width="medium"
            ),
            "URL": st.column_config.LinkColumn("URL", width="small"),
            "Notes": st.column_config.TextColumn("Notes", width="large"),
        }
        # Custom column configs
        for cc in custom_cols:
            if cc["type"] == "yes_no":
                col_config[cc["name"]] = st.column_config.CheckboxColumn(cc["name"])
            elif cc["type"] == "number":
                col_config[cc["name"]] = st.column_config.NumberColumn(cc["name"])
            elif cc["type"] == "date":
                col_config[cc["name"]] = st.column_config.TextColumn(cc["name"])
            elif cc["type"] == "select" and cc.get("options"):
                col_config[cc["name"]] = st.column_config.SelectboxColumn(cc["name"], options=cc["options"])
            else:
                col_config[cc["name"]] = st.column_config.TextColumn(cc["name"])

        edited_df = st.data_editor(
            df,
            column_config=col_config,
            use_container_width=True,
            num_rows="fixed",
            hide_index=True,
            key="tracker_table"
        )

        # Detect edits and save
        if edited_df is not None and not edited_df.equals(df):
            status_reverse = {v: k for k, v in STATUS_LABELS.items()}
            for idx in range(len(edited_df)):
                orig = df.iloc[idx]
                edited = edited_df.iloc[idx]
                jid = orig["ID"]
                changes = {}

                if edited["Company"] != orig["Company"]:
                    changes["company"] = edited["Company"]
                if edited["Title"] != orig["Title"]:
                    changes["title"] = edited["Title"]
                if edited["Status"] != orig["Status"]:
                    new_status_key = status_reverse.get(edited["Status"])
                    if new_status_key:
                        changes["status"] = new_status_key
                if edited["Date Applied"] != orig["Date Applied"]:
                    changes["date_applied"] = edited["Date Applied"]
                if edited["Salary"] != orig["Salary"]:
                    sal = str(edited["Salary"])
                    if "–" in sal:
                        parts = sal.split("–")
                        changes["salary_min"] = parts[0].strip()
                        changes["salary_max"] = parts[1].strip()
                    else:
                        changes["salary_min"] = sal
                if edited["Follow-up"] != orig["Follow-up"]:
                    changes["follow_up_date"] = edited["Follow-up"]
                if edited["URL"] != orig["URL"]:
                    changes["url"] = edited["URL"]
                if edited["Notes"] != orig["Notes"]:
                    changes["notes"] = edited["Notes"]

                # Custom column changes
                for cc in custom_cols:
                    col_name = cc["name"]
                    if col_name in edited.index and col_name in orig.index:
                        new_val = edited[col_name]
                        old_val = orig[col_name]
                        if cc["type"] == "yes_no":
                            new_val = new_val == "✅" if isinstance(new_val, str) else bool(new_val)
                            old_val = old_val == "✅" if isinstance(old_val, str) else bool(old_val)
                        if str(new_val) != str(old_val):
                            update_custom_field(jid, cc["id"], new_val)

                if changes:
                    update_job(jid, changes)

        # Delete & Session buttons below table
        st.markdown("---")
        del_cols = st.columns([1, 1, 4])
        with del_cols[0]:
            del_id = st.selectbox("Select job to delete", [""] + [f"{j['company']} – {j['title']}" for j in jobs],
                                  key="table_del_select", label_visibility="collapsed")
        with del_cols[1]:
            if st.button("🗑️ Delete Selected", key="table_del_btn"):
                if del_id:
                    idx = [f"{j['company']} – {j['title']}" for j in jobs].index(del_id)
                    delete_job(jobs[idx]["id"])
                    st.rerun()

        # Manage custom columns
        if custom_cols:
            with st.expander("⚙️ Manage Custom Columns"):
                for cc in custom_cols:
                    mc1, mc2 = st.columns([4, 1])
                    with mc1:
                        st.caption(f"**{cc['name']}** ({COLUMN_TYPE_LABELS.get(cc['type'], cc['type'])})")
                    with mc2:
                        if st.button("🗑️", key=f"del_col_{cc['id']}", help=f"Delete {cc['name']}"):
                            delete_custom_column(cc["id"])
                            st.rerun()

    # ========== CARDS VIEW ==========
    else:
        # Sort controls
        _sort_options = {
            "date_desc": "📅 Applied (newest first)",
            "date_asc": "📅 Applied (oldest first)",
            "added_desc": "🕐 Added (newest first)",
            "added_asc": "🕐 Added (oldest first)",
            "company_asc": "🏢 Company (A → Z)",
            "title_asc": "💼 Title (A → Z)",
            "status": "📊 Status",
        }
        _sort_col1, _sort_col2 = st.columns([1, 5])
        with _sort_col1:
            _new_sort = st.selectbox(
                "Sort by", list(_sort_options.keys()),
                index=list(_sort_options.keys()).index(st.session_state.tracker_sort),
                format_func=lambda x: _sort_options[x],
                key="tracker_sort_select", label_visibility="collapsed",
            )
            if _new_sort != st.session_state.tracker_sort:
                st.session_state.tracker_sort = _new_sort
                st.rerun()

        # Apply sort
        _sk = st.session_state.tracker_sort
        if _sk == "date_desc":
            jobs = sorted(jobs, key=lambda j: j.get("date_applied", ""), reverse=True)
        elif _sk == "date_asc":
            jobs = sorted(jobs, key=lambda j: j.get("date_applied", ""))
        elif _sk == "added_desc":
            jobs = sorted(jobs, key=lambda j: j.get("created_at", ""), reverse=True)
        elif _sk == "added_asc":
            jobs = sorted(jobs, key=lambda j: j.get("created_at", ""))
        elif _sk == "company_asc":
            jobs = sorted(jobs, key=lambda j: j.get("company", "").lower())
        elif _sk == "title_asc":
            jobs = sorted(jobs, key=lambda j: j.get("title", "").lower())
        elif _sk == "status":
            _status_order = {s[0]: i for i, s in enumerate(STATUSES)}
            jobs = sorted(jobs, key=lambda j: _status_order.get(j.get("status", ""), 99))

        for job in jobs:
            jid = job["id"]
            color = STATUS_COLORS.get(job["status"], "#94a3b8")
            label = STATUS_LABELS.get(job["status"], job["status"])
            is_editing = st.session_state.tracker_editing_id == jid

            salary_text = ""
            if job.get("salary_min") and job.get("salary_max"):
                salary_text = f"💰 {job['salary_min']} – {job['salary_max']}"
            elif job.get("salary_min"):
                salary_text = f"💰 {job['salary_min']}"

            meta_parts = []
            if job.get("location"):
                meta_parts.append(f"📍 {job['location']}")
            if job.get("work_type"):
                meta_parts.append(WORK_TYPE_LABELS.get(job["work_type"], job["work_type"]))
            if salary_text:
                meta_parts.append(salary_text)
            if job.get("date_applied"):
                meta_parts.append(f"📅 {job['date_applied']}")
            if job.get("follow_up_date"):
                meta_parts.append(f"⏰ Follow up: {job['follow_up_date']}")
            meta_html = " &nbsp;•&nbsp; ".join(meta_parts)

            url_html = ""
            if job.get("url"):
                url_html = f" &nbsp;•&nbsp; <a href='{job['url']}' target='_blank'>🔗 Link</a>"

            # Custom fields display
            cf = job.get("custom_fields", {})
            custom_parts = []
            for cc in custom_cols:
                val = cf.get(cc["id"], "")
                if val != "" and val is not None:
                    display_val = "✅" if (cc["type"] == "yes_no" and val) else "❌" if (cc["type"] == "yes_no" and not val) else str(val)
                    custom_parts.append(f"{cc['name']}: {display_val}")
            custom_html = ""
            if custom_parts:
                custom_html = f"<div style='color: #8b5cf6; font-size: 0.82rem; margin-top: 4px;'>{'  •  '.join(custom_parts)}</div>"

            st.markdown(f"""
                <style>
                    .tracker-card {{
                        border-left: 4px solid {color}; border-radius: 0 10px 10px 0;
                        padding: 15px 20px; margin-bottom: 2px;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.08);
                    }}
                    @media (prefers-color-scheme: dark) {{
                        .tracker-card {{ background: #1e293b; }}
                        .tracker-card .tc-title {{ color: #e2e8f0; }}
                        .tracker-card .tc-sep {{ color: #475569; }}
                        .tracker-card .tc-company {{ color: #94a3b8; }}
                        .tracker-card .tc-meta {{ color: #64748b; }}
                    }}
                    @media (prefers-color-scheme: light) {{
                        .tracker-card {{ background: #f8fafc; }}
                        .tracker-card .tc-title {{ color: #1e293b; }}
                        .tracker-card .tc-sep {{ color: #94a3b8; }}
                        .tracker-card .tc-company {{ color: #64748b; }}
                        .tracker-card .tc-meta {{ color: #94a3b8; }}
                    }}
                </style>
                <div class="tracker-card">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span class="tc-title" style="font-size: 1.1rem; font-weight: 700;">{job["title"]}</span>
                            <span class="tc-sep" style="margin: 0 6px;">@</span>
                            <span class="tc-company" style="font-size: 0.95rem;">{job["company"]}</span>
                        </div>
                        <span style="background: {color}; color: white; padding: 3px 10px;
                                     border-radius: 12px; font-size: 0.78rem; font-weight: 600; white-space: nowrap;">{label}</span>
                    </div>
                    <div class="tc-meta" style="font-size: 0.82rem; margin-top: 6px;">
                        {meta_html}{url_html}
                    </div>
                    {custom_html}
                </div>
            """, unsafe_allow_html=True)

            # Notes rendered separately to avoid Streamlit HTML sanitization issues
            if job.get("notes"):
                clean_notes = re.sub(r'<[^>]+>', '', str(job["notes"])).strip()
                if clean_notes:
                    truncated = clean_notes[:120] + ("..." if len(clean_notes) > 120 else "")
                    st.caption(f"📝 {truncated}")

            # Action buttons
            ac1, ac2, ac3, ac4, ac5 = st.columns([1, 1, 1, 2, 3])
            with ac1:
                if st.button("✏️", key=f"edit_{jid}", help="Edit", use_container_width=True):
                    st.session_state.tracker_editing_id = jid if not is_editing else None
                    st.rerun()
            with ac2:
                if st.button("🗑️", key=f"del_{jid}", help="Delete", use_container_width=True):
                    delete_job(jid)
                    st.rerun()
            with ac3:
                if job.get("linked_session_id") and job["linked_session_id"] != "unsaved":
                    if st.button("📄", key=f"open_{jid}", help="Open linked session", use_container_width=True):
                        loaded = load_session(job["linked_session_id"])
                        if loaded:
                            st.session_state.pdf_bytes = loaded.get("pdf_bytes")
                            st.session_state.pdf_filename = loaded.get("pdf_filename")
                            st.session_state.resume_data = loaded.get("resume_data")
                            st.session_state.resume_html = loaded.get("resume_html")
                            st.session_state.analysis_result = loaded.get("analysis_result")
                            st.session_state.job_matches = loaded.get("job_matches")
                            st.session_state.timeline = loaded.get("timeline", [])
                            st.session_state.selected_job = loaded.get("selected_job")
                            st.session_state.current_diff = loaded.get("current_diff", {})
                            st.session_state.page = loaded.get("page", "analysis")
                            st.session_state.current_session_id = job["linked_session_id"]
                            st.session_state.cover_letter_text = loaded.get("cover_letter_text", "")
                            st.session_state.cover_letter_question = loaded.get("cover_letter_question", "")
                            st.session_state.cl_timeline = loaded.get("cl_timeline", [])
                            st.rerun()
                        else:
                            st.toast("⚠️ Session not found.")
            with ac4:
                new_status = st.selectbox(
                    "Status", [s[0] for s in STATUSES],
                    index=[s[0] for s in STATUSES].index(job["status"]),
                    format_func=lambda x: STATUS_LABELS[x],
                    key=f"status_{jid}", label_visibility="collapsed"
                )
                if new_status != job["status"]:
                    update_job(jid, {"status": new_status})
                    st.rerun()

            # Inline edit form
            if is_editing:
                with st.form(f"edit_form_{jid}"):
                    st.markdown(f"#### Editing: {job['title']} @ {job['company']}")
                    ec1, ec2 = st.columns(2)
                    _ewt_keys = [w[0] for w in WORK_TYPES]
                    _ewt_idx = _ewt_keys.index(job.get("work_type", "")) if job.get("work_type", "") in _ewt_keys else 0
                    with ec1:
                        e_company = st.text_input("Company", value=job["company"], key=f"e_co_{jid}")
                        e_title = st.text_input("Title", value=job["title"], key=f"e_ti_{jid}")
                        e_url = st.text_input("URL", value=job.get("url", ""), key=f"e_url_{jid}")
                        e_location = st.text_input("Location", value=job.get("location", ""), key=f"e_loc_{jid}")
                        e_salary_min = st.text_input("Salary Min", value=job.get("salary_min", ""), key=f"e_smin_{jid}")
                    with ec2:
                        e_salary_max = st.text_input("Salary Max", value=job.get("salary_max", ""), key=f"e_smax_{jid}")
                        e_work_type = st.selectbox("Work Type", _ewt_keys, index=_ewt_idx,
                                                    format_func=lambda x: WORK_TYPE_LABELS[x], key=f"e_wt_{jid}")
                        e_follow_up = st.text_input("Follow-up Date", value=job.get("follow_up_date", ""), key=f"e_fu_{jid}")
                        e_date = st.text_input("Date Applied", value=job.get("date_applied", ""), key=f"e_da_{jid}")
                        e_contact = st.text_input("Contact",
                                                  value=job["contacts"][0]["name"] if job.get("contacts") else "",
                                                  key=f"e_ct_{jid}")

                    # Custom fields in edit form
                    if custom_cols:
                        st.markdown("**Custom Fields**")
                        cec1, cec2 = st.columns(2)
                        cf = job.get("custom_fields", {})
                        for ci, cc in enumerate(custom_cols):
                            with cec1 if ci % 2 == 0 else cec2:
                                val = cf.get(cc["id"], "")
                                if cc["type"] == "yes_no":
                                    val = st.checkbox(cc["name"], value=bool(val), key=f"cf_{jid}_{cc['id']}")
                                elif cc["type"] == "number":
                                    val = st.number_input(cc["name"], value=int(val) if val else 0, key=f"cf_{jid}_{cc['id']}")
                                elif cc["type"] == "select" and cc.get("options"):
                                    options = [""] + cc["options"]
                                    idx = options.index(val) if val in options else 0
                                    val = st.selectbox(cc["name"], options, index=idx, key=f"cf_{jid}_{cc['id']}")
                                else:
                                    val = st.text_input(cc["name"], value=str(val) if val else "", key=f"cf_{jid}_{cc['id']}")

                    e_notes = st.text_area("Notes", value=job.get("notes", ""), key=f"e_nt_{jid}", height=80)

                    if st.form_submit_button("💾 Save Changes", use_container_width=True):
                        contacts = [{"name": e_contact, "role": "", "email": ""}] if e_contact else []
                        update_job(jid, {
                            "company": e_company, "title": e_title, "url": e_url,
                            "location": e_location, "work_type": e_work_type,
                            "salary_min": e_salary_min, "salary_max": e_salary_max,
                            "follow_up_date": e_follow_up, "date_applied": e_date,
                            "notes": e_notes, "contacts": contacts,
                        })
                        # Save custom fields
                        cf = job.get("custom_fields", {})
                        for cc in custom_cols:
                            new_val = st.session_state.get(f"cf_{jid}_{cc['id']}")
                            if new_val is not None:
                                update_custom_field(jid, cc["id"], new_val)
                        st.session_state.tracker_editing_id = None
                        st.rerun()

            st.markdown("<div style='margin-bottom: 8px;'></div>", unsafe_allow_html=True)

        # Manage custom columns
        if custom_cols:
            with st.expander("⚙️ Manage Custom Columns"):
                for cc in custom_cols:
                    mc1, mc2 = st.columns([4, 1])
                    with mc1:
                        st.caption(f"**{cc['name']}** ({COLUMN_TYPE_LABELS.get(cc['type'], cc['type'])})")
                    with mc2:
                        if st.button("🗑️", key=f"del_col_{cc['id']}", help=f"Delete {cc['name']}"):
                            delete_custom_column(cc["id"])
                            st.rerun()

elif st.session_state.page == "skill_insights":
    # ============== Skill Insights Page ==============

    # ── Header row: title + view toggle + refresh button ──
    _si_title, _si_toggle, _si_refresh = st.columns([7, 1, 1])
    with _si_title:
        st.markdown("## 📊 Skill Insights")
    with _si_toggle:
        _toggle_icon = "📋" if st.session_state.si_view == "charts" else "📊"
        _toggle_tip = "Switch to Data view" if st.session_state.si_view == "charts" else "Switch to Charts view"
        if st.button(_toggle_icon, key="si_toggle_view", help=_toggle_tip, use_container_width=True):
            st.session_state.si_view = "data" if st.session_state.si_view == "charts" else "charts"
            st.rerun()
    with _si_refresh:
        refresh_clicked = st.button("🔄", key="si_refresh", help="Re-extract keywords (clears cache)")

    if refresh_clicked:
        # Clear keyword cache so everything re-extracts
        from services.keyword_profile import save_keyword_cache
        save_keyword_cache({})
        st.toast("🔄 Cache cleared — re-extracting keywords...")
        st.rerun()

    # ── Load all tracked jobs (filtered by visitor on cloud) ──
    all_tracker_jobs = get_jobs_by_status("all", visitor_id=st.session_state.visitor_id)

    if not all_tracker_jobs:
        st.info("No tracked jobs yet. Add jobs in the **📋 Job Tracker** first, then come back for insights.")
    else:
        # ── Status filter tabs (2 rows to avoid crowding) ──
        status_options = [("all", "All")] + [(s[0], s[1]) for s in STATUSES]
        row1 = status_options[:5]
        row2 = status_options[5:]
        for row in [row1, row2]:
            if not row:
                continue
            cols = st.columns(len(row))
            for i, (key, label) in enumerate(row):
                count = len(all_tracker_jobs) if key == "all" else len([j for j in all_tracker_jobs if j["status"] == key])
                with cols[i]:
                    btn_type = "primary" if st.session_state.skill_status_filter == key else "secondary"
                    if st.button(f"{label} ({count})", key=f"si_filter_{key}", type=btn_type, use_container_width=True):
                        st.session_state.skill_status_filter = key
                        st.rerun()

        # ── Gather requirements from tracker entries + linked sessions ──
        all_jobs_with_reqs = []
        jobs_without_reqs = []
        for job in all_tracker_jobs:
            # First: check if job itself has requirements (smart-add or imported)
            reqs = job.get("requirements", [])
            if reqs:
                all_jobs_with_reqs.append({"job_id": job["id"], "requirements": reqs})
                continue
            # Fallback: load from linked session
            sid = job.get("linked_session_id")
            if sid:
                sess = load_session(sid)
                if sess:
                    reqs = sess.get("selected_job", {}).get("requirements", [])
                    if reqs:
                        all_jobs_with_reqs.append({"job_id": job["id"], "requirements": reqs})
                        continue
            jobs_without_reqs.append(job)

        if not all_jobs_with_reqs:
            st.warning("No jobs with keyword data available. Import jobs with linked sessions from the **📋 Job Tracker** to get skill insights.")
        else:
            # ── Extract & cache keywords for ALL jobs ──
            api_key = st.session_state.get("api_key", os.getenv("OPENAI_API_KEY", ""))
            model_choice = st.session_state.get("model_choice", "gpt-4.1-mini")

            with st.spinner(f"Analyzing keywords from {len(all_jobs_with_reqs)} job(s)..."):
                keyword_data = extract_and_cache_all(all_jobs_with_reqs, model_choice, api_key)

            # ── Filter to selected status for charts ──
            if st.session_state.skill_status_filter == "all":
                filtered_ids = list(keyword_data.keys())
            else:
                filtered_ids = [
                    j["id"] for j in all_tracker_jobs
                    if j["status"] == st.session_state.skill_status_filter and j["id"] in keyword_data
                ]

            # ── Aggregate (filtered) ──
            aggregated = aggregate_keywords(keyword_data, filtered_ids)

            # ── Category color map for tags ──
            _CAT_COLORS = {
                "Languages & Frameworks": ("#dbeafe", "#1e40af"),
                "Cloud & DevOps": ("#fef3c7", "#92400e"),
                "Data & AI": ("#ede9fe", "#5b21b6"),
                "Business & Strategy": ("#fce7f3", "#9d174d"),
                "Marketing & Growth": ("#fff7ed", "#c2410c"),
                "Sales & BD": ("#ecfdf5", "#065f46"),
                "Product & Design": ("#e0f2fe", "#0369a1"),
                "Operations & HR": ("#fef9c3", "#854d0e"),
                "Soft Skills": ("#fdf2f8", "#86198f"),
                "Tools & Platforms": ("#f1f5f9", "#475569"),
                "Other": ("#f5f5f4", "#57534e"),
            }

            # ════════════════ CHARTS VIEW ════════════════
            if st.session_state.si_view == "charts":

                # Separate hard skills vs soft skills in aggregated data
                _hard_skill_counts = {s: c for s, c in aggregated["skill_counts"].items() if not is_soft_skill(s)}
                _soft_skill_counts = {s: c for s, c in aggregated["skill_counts"].items() if is_soft_skill(s)}
                _hard_cat_counts = {c: v for c, v in aggregated["category_counts"].items() if c != "Soft Skills"}

                if not _hard_skill_counts and not _soft_skill_counts:
                    st.info("No keywords extracted from the selected jobs.")
                else:
                    # ── Row 1: Top Hard Skills + Category Donut ──
                    chart_l, chart_r = st.columns([3, 2])

                    with chart_l:
                        st.markdown("### 🏆 Top Skills in Demand")
                        top_skills = dict(list(_hard_skill_counts.items())[:15])
                        skill_names = list(top_skills.keys())
                        skill_counts_list = list(top_skills.values())
                        skill_cats = []
                        for s in skill_names:
                            cat = "Other"
                            for c, skills in aggregated["skills_by_category"].items():
                                if s in skills:
                                    cat = c
                                    break
                            skill_cats.append(cat)

                        if skill_names:
                            fig_bar = px.bar(
                                x=skill_counts_list[::-1],
                                y=skill_names[::-1],
                                orientation="h",
                                color=skill_cats[::-1],
                                color_discrete_sequence=px.colors.qualitative.Set2,
                                labels={"x": "Job Count", "y": "", "color": "Category"},
                            )
                            fig_bar.update_layout(
                                height=450,
                                margin=dict(l=0, r=20, t=10, b=60),
                                legend=dict(orientation="h", yanchor="bottom", y=-0.22, xanchor="center", x=0.5),
                                plot_bgcolor="rgba(0,0,0,0)",
                                paper_bgcolor="rgba(0,0,0,0)",
                            )
                            st.plotly_chart(fig_bar, use_container_width=True)
                        else:
                            st.info("No hard skills extracted yet.")

                    with chart_r:
                        st.markdown("### 📂 Category Breakdown")
                        cat_names = list(_hard_cat_counts.keys())
                        cat_vals = list(_hard_cat_counts.values())
                        if cat_names:
                            fig_pie = px.pie(
                                names=cat_names,
                                values=cat_vals,
                                hole=0.45,
                                color_discrete_sequence=px.colors.qualitative.Set2,
                            )
                            fig_pie.update_layout(
                                height=420,
                                margin=dict(l=0, r=0, t=10, b=30),
                                legend=dict(orientation="h", yanchor="bottom", y=-0.15, xanchor="center", x=0.5),
                                paper_bgcolor="rgba(0,0,0,0)",
                            )
                            fig_pie.update_traces(textposition="inside", textinfo="label+percent")
                            st.plotly_chart(fig_pie, use_container_width=True)

                    # ── Soft Skills Summary (compact) ──
                    if _soft_skill_counts:
                        st.markdown("### 🧠 Soft Skills Summary")
                        st.caption("Normalized from all JD variations into canonical categories.")
                        _ss_tags = " ".join(
                            f"<span style='display:inline-block; background:linear-gradient(135deg,#818cf8,#6366f1);"
                            f"color:#fff; padding:5px 14px; border-radius:20px; font-size:0.85rem; margin:3px;'>"
                            f"{s} <span style=\"opacity:0.75;\">({c}/{aggregated['total_jobs']})</span></span>"
                            for s, c in _soft_skill_counts.items()
                        )
                        st.markdown(_ss_tags, unsafe_allow_html=True)

                    st.divider()

                    # ── Row 2: Skills by Category + Resume Gap ──
                    det_l, det_r = st.columns([3, 2])

                    with det_l:
                        st.markdown("### 📋 Skills by Category")
                        for cat, skills in aggregated["skills_by_category"].items():
                            if cat == "Soft Skills":
                                continue  # shown separately above
                            with st.expander(f"{cat}  ({sum(skills.values())} mentions)", expanded=False):
                                for skill, count in skills.items():
                                    if is_soft_skill(skill):
                                        continue
                                    pct = count / aggregated["total_jobs"] * 100
                                    st.markdown(
                                        f"<div style='display:flex; align-items:center; margin-bottom:4px;'>"
                                        f"<span style='width:140px; font-size:0.9rem;'>{skill}</span>"
                                        f"<div style='flex:1; background:#e2e8f0; border-radius:4px; height:14px; margin:0 8px;'>"
                                        f"<div style='width:{pct:.0f}%; background:linear-gradient(90deg,#667eea,#764ba2);"
                                        f"border-radius:4px; height:14px;'></div></div>"
                                        f"<span style='font-size:0.85rem; color:#64748b; width:55px; text-align:right;'>"
                                        f"{count}/{aggregated['total_jobs']}</span></div>",
                                        unsafe_allow_html=True,
                                    )

                    with det_r:
                        st.markdown("### 🎯 Resume Gap Analysis")
                        st.caption("Based on hard skills only — soft skills shown separately above.")
                        resume_skills = {}
                        if st.session_state.get("resume_data"):
                            resume_skills = st.session_state.resume_data.get("skills", {})

                        if not resume_skills:
                            st.info("Upload a resume to see how your skills compare to job requirements.")
                        else:
                            gaps = compute_resume_gaps(aggregated, resume_skills)

                            # Match percentage metric
                            pct = gaps["match_percentage"]
                            pct_color = "#22c55e" if pct >= 70 else "#f59e0b" if pct >= 50 else "#ef4444"
                            st.markdown(
                                f"<div style='text-align:center; padding:15px; background:linear-gradient(135deg,#f8fafc,#e2e8f0);"
                                f"border-radius:12px; margin-bottom:15px;'>"
                                f"<div style='font-size:2.5rem; font-weight:800; color:{pct_color};'>{pct}%</div>"
                                f"<div style='color:#64748b; font-size:0.9rem;'>Hard Skill Coverage</div></div>",
                                unsafe_allow_html=True,
                            )

                            if gaps["matched"]:
                                st.markdown("**✅ Skills You Have**")
                                matched_tags = " ".join(
                                    f"<span style='display:inline-block; background:#dcfce7; color:#166534; padding:3px 10px;"
                                    f"border-radius:12px; font-size:0.82rem; margin:2px;'>{g['skill']} ({g['count']})</span>"
                                    for g in gaps["matched"]
                                )
                                st.markdown(matched_tags, unsafe_allow_html=True)

                            if gaps["gaps"]:
                                st.markdown("**❌ Skills to Develop**")
                                gap_tags = " ".join(
                                    f"<span style='display:inline-block; background:#fef2f2; color:#991b1b; padding:3px 10px;"
                                    f"border-radius:12px; font-size:0.82rem; margin:2px;'>{g['skill']} ({g['count']})</span>"
                                    for g in gaps["gaps"]
                                )
                                st.markdown(gap_tags, unsafe_allow_html=True)

                    st.divider()

                    # ── Row 2.5: Location & Work Type Distribution ──
                    _loc_wt_col1, _loc_wt_col2 = st.columns(2)
                    with _loc_wt_col1:
                        st.markdown("### 🏢 Work Type Distribution")
                        from collections import Counter as _Counter
                        _wt_counts = _Counter()
                        _all_trk = get_jobs_by_status("all", visitor_id=st.session_state.visitor_id)
                        if st.session_state.skill_status_filter and st.session_state.skill_status_filter != "all":
                            _all_trk = [j for j in _all_trk if j.get("status") == st.session_state.skill_status_filter]
                        for _j in _all_trk:
                            _wt = _j.get("work_type", "")
                            if _wt:
                                _wt_counts[WORK_TYPE_LABELS.get(_wt, _wt)] += 1
                            else:
                                _wt_counts["Not specified"] += 1
                        if _wt_counts:
                            import plotly.express as _px_wt
                            _fig_wt = _px_wt.pie(
                                names=list(_wt_counts.keys()),
                                values=list(_wt_counts.values()),
                                hole=0.45,
                                color_discrete_sequence=["#3b82f6", "#22c55e", "#f59e0b", "#94a3b8"],
                            )
                            _fig_wt.update_layout(
                                paper_bgcolor="rgba(0,0,0,0)",
                                plot_bgcolor="rgba(0,0,0,0)",
                                font=dict(color="#e2e8f0"),
                                margin=dict(t=20, b=20, l=20, r=20),
                                height=300,
                            )
                            st.plotly_chart(_fig_wt, use_container_width=True)
                        else:
                            st.info("No work type data yet.")

                    with _loc_wt_col2:
                        st.markdown("### 📍 Top Locations")
                        _loc_counts = _Counter()
                        for _j in _all_trk:
                            _loc = (_j.get("location") or "").strip()
                            if _loc and _loc.lower() not in ("not specified", "unknown", "n/a", ""):
                                _loc_counts[_loc] += 1
                        if _loc_counts:
                            _top_locs = _loc_counts.most_common(10)
                            import plotly.express as _px_loc
                            _fig_loc = _px_loc.bar(
                                x=[c for _, c in _top_locs][::-1],
                                y=[l for l, _ in _top_locs][::-1],
                                orientation="h",
                                color_discrete_sequence=["#6366f1"],
                            )
                            _fig_loc.update_layout(
                                paper_bgcolor="rgba(0,0,0,0)",
                                plot_bgcolor="rgba(0,0,0,0)",
                                font=dict(color="#e2e8f0"),
                                margin=dict(t=20, b=20, l=20, r=20),
                                height=300,
                                xaxis_title="Count",
                                yaxis_title="",
                                showlegend=False,
                            )
                            st.plotly_chart(_fig_loc, use_container_width=True)
                        else:
                            st.info("No location data yet. Add locations to your tracked jobs.")

                    st.divider()

                    # ── Row 3: Status Comparison ──
                    st.markdown("### 🔀 Status Comparison")
                    st.caption("Compare skill profiles between different application outcomes.")

                    cmp1, cmp2, _ = st.columns([2, 2, 4])
                    avail_statuses = list({j["status"] for j in all_tracker_jobs})
                    avail_labels = [(s, STATUS_LABELS.get(s, s)) for s in avail_statuses]

                    if len(avail_labels) < 2:
                        st.info("Need jobs in at least 2 different statuses to compare.")
                    else:
                        with cmp1:
                            status_a = st.selectbox(
                                "Status A",
                                options=[s[0] for s in avail_labels],
                                format_func=lambda x: STATUS_LABELS.get(x, x),
                                key="si_cmp_a",
                            )
                        with cmp2:
                            remaining = [s for s in avail_labels if s[0] != status_a]
                            status_b = st.selectbox(
                                "Status B",
                                options=[s[0] for s in remaining],
                                format_func=lambda x: STATUS_LABELS.get(x, x),
                                key="si_cmp_b",
                            )

                        # Gather keyword data for each status group
                        jobs_a_ids = [j["id"] for j in all_tracker_jobs if j["status"] == status_a and j["id"] in keyword_data]
                        jobs_b_ids = [j["id"] for j in all_tracker_jobs if j["status"] == status_b and j["id"] in keyword_data]

                        if not jobs_a_ids or not jobs_b_ids:
                            st.info("One or both selected statuses have no jobs with keyword data.")
                        else:
                            agg_a = aggregate_keywords(keyword_data, jobs_a_ids)
                            agg_b = aggregate_keywords(keyword_data, jobs_b_ids)

                            # Get union of top hard skills (exclude soft skills)
                            _hard_a = {s: c for s, c in agg_a["skill_counts"].items() if not is_soft_skill(s)}
                            _hard_b = {s: c for s, c in agg_b["skill_counts"].items() if not is_soft_skill(s)}
                            all_skills_union = list(dict.fromkeys(
                                list(_hard_a.keys())[:10] + list(_hard_b.keys())[:10]
                            ))

                            fig_cmp = go.Figure()
                            fig_cmp.add_trace(go.Bar(
                                name=STATUS_LABELS.get(status_a, status_a),
                                x=all_skills_union,
                                y=[_hard_a.get(s, 0) for s in all_skills_union],
                                marker_color=STATUS_COLORS.get(status_a, "#94a3b8"),
                            ))
                            fig_cmp.add_trace(go.Bar(
                                name=STATUS_LABELS.get(status_b, status_b),
                                x=all_skills_union,
                                y=[_hard_b.get(s, 0) for s in all_skills_union],
                                marker_color=STATUS_COLORS.get(status_b, "#64748b"),
                            ))
                            fig_cmp.update_layout(
                                barmode="group",
                                height=500,
                                margin=dict(l=40, r=20, t=10, b=140),
                                plot_bgcolor="rgba(0,0,0,0)",
                                paper_bgcolor="rgba(0,0,0,0)",
                                legend=dict(orientation="h", yanchor="top", y=-0.45, xanchor="center", x=0.5),
                                xaxis_title="",
                                yaxis_title="Job Count",
                                yaxis=dict(dtick=1),
                            )
                            fig_cmp.update_xaxes(tickangle=-45, tickfont=dict(size=11))
                            st.plotly_chart(fig_cmp, use_container_width=True)

            # ════════════════ DATA VIEW ════════════════
            elif st.session_state.si_view == "data":
                st.caption("View and edit all job data that feeds into Skill Insights charts.")

                # Apply status filter to tracker jobs for data view
                _sf = st.session_state.skill_status_filter
                _filtered_tracker = all_tracker_jobs if _sf == "all" else [j for j in all_tracker_jobs if j.get("status") == _sf]

                # Build a lookup: job_id → job info
                _job_lookup = {j["id"]: j for j in _filtered_tracker}

                # Collect all displayable job IDs (with keywords + manual with cache)
                cache = load_keyword_cache()
                _display_job_ids = [jid for jid in keyword_data.keys() if jid in _job_lookup]
                _filtered_without_reqs = [j for j in jobs_without_reqs if j["id"] in _job_lookup]
                for j in _filtered_without_reqs:
                    if j["id"] in cache and cache[j["id"]].get("keywords"):
                        _display_job_ids.append(j["id"])
                        keyword_data[j["id"]] = cache[j["id"]]["keywords"]
                # Also include manual jobs WITHOUT cache
                _manual_no_cache = [j for j in _filtered_without_reqs if j["id"] not in _display_job_ids]
                _all_data_ids = _display_job_ids + [j["id"] for j in _manual_no_cache]

                if not _all_data_ids:
                    st.info("No job data to display.")
                else:
                    for _idx, _jid in enumerate(_all_data_ids):
                        _job_info = _job_lookup.get(_jid, {})
                        _company = _job_info.get("company", "Unknown")
                        _title = _job_info.get("title", "Unknown")
                        _status = _job_info.get("status", "")
                        _status_label = STATUS_LABELS.get(_status, _status)
                        _status_color = STATUS_COLORS.get(_status, "#94a3b8")
                        _kws = keyword_data.get(_jid, [])
                        _kw_count = len(_kws)

                        with st.expander(
                            f"**{_company}** — {_title}  ({_kw_count} keywords)",
                            expanded=(st.session_state.si_editing_job == _jid),
                        ):
                            # ── Job Details Section ──
                            st.markdown("##### Job Details")
                            _d1, _d2 = st.columns(2)
                            with _d1:
                                _new_company = st.text_input(
                                    "Company", value=_company,
                                    key=f"sid_company_{_jid}",
                                )
                                _new_title = st.text_input(
                                    "Title", value=_title,
                                    key=f"sid_title_{_jid}",
                                )
                                _status_keys = [s[0] for s in STATUSES]
                                _status_idx = _status_keys.index(_status) if _status in _status_keys else 0
                                _new_status = st.selectbox(
                                    "Status",
                                    options=_status_keys,
                                    index=_status_idx,
                                    format_func=lambda x: STATUS_LABELS.get(x, x),
                                    key=f"sid_status_{_jid}",
                                )
                            with _d2:
                                _new_salary = st.text_input(
                                    "Salary", value=_job_info.get("salary", ""),
                                    key=f"sid_salary_{_jid}",
                                )
                                _new_url = st.text_input(
                                    "URL", value=_job_info.get("url", ""),
                                    key=f"sid_url_{_jid}",
                                )
                                _new_notes = st.text_area(
                                    "Notes", value=_job_info.get("notes", ""),
                                    key=f"sid_notes_{_jid}",
                                    height=68,
                                )

                            # Save details button
                            if st.button("💾 Save Details", key=f"sid_save_{_jid}", use_container_width=True):
                                _updates = {}
                                if _new_company != _company:
                                    _updates["company"] = _new_company
                                if _new_title != _title:
                                    _updates["title"] = _new_title
                                if _new_status != _status:
                                    _updates["status"] = _new_status
                                if _new_salary != _job_info.get("salary", ""):
                                    _updates["salary"] = _new_salary
                                if _new_url != _job_info.get("url", ""):
                                    _updates["url"] = _new_url
                                if _new_notes != _job_info.get("notes", ""):
                                    _updates["notes"] = _new_notes
                                if _updates:
                                    update_job(_jid, _updates)
                                    st.toast(f"✅ Saved changes for {_new_company} — {_new_title}")
                                    st.rerun()
                                else:
                                    st.toast("No changes to save.")

                            st.divider()

                            # ── Keywords Section ──
                            st.markdown("##### Keywords")
                            if _kws:
                                _tags_html = ""
                                for _kw in _kws:
                                    _bg, _fg = _CAT_COLORS.get(_kw.get("category", "Other"), _CAT_COLORS["Other"])
                                    _tags_html += (
                                        f"<span style='display:inline-block; background:{_bg}; color:{_fg}; "
                                        f"padding:2px 10px; border-radius:12px; font-size:0.8rem; margin:2px;'>"
                                        f"{_kw['skill']}</span> "
                                    )
                                st.markdown(_tags_html, unsafe_allow_html=True)

                                # Deletable keyword list
                                _rm_cols = st.columns(min(len(_kws), 6))
                                for _ki, _kw in enumerate(_kws):
                                    with _rm_cols[_ki % len(_rm_cols)]:
                                        if st.button(
                                            f"❌ {_kw['skill']}",
                                            key=f"sid_rm_{_jid}_{_ki}",
                                            help=f"Remove {_kw['skill']}",
                                            use_container_width=True,
                                        ):
                                            remove_keyword_from_job(_jid, _kw["skill"])
                                            st.rerun()
                            else:
                                st.caption("No keywords extracted yet.")

                            # Add new keyword row
                            _ak1, _ak2, _ak3 = st.columns([3, 2, 1])
                            with _ak1:
                                _new_skill = st.text_input(
                                    "Add keyword", placeholder="e.g. Docker",
                                    key=f"sid_newsk_{_jid}", label_visibility="collapsed",
                                )
                            with _ak2:
                                _cat_options = list(SKILL_CATEGORIES.keys()) + ["Other"]
                                _new_cat = st.selectbox(
                                    "Category", _cat_options,
                                    key=f"sid_newcat_{_jid}", label_visibility="collapsed",
                                )
                            with _ak3:
                                if st.button("➕", key=f"sid_add_{_jid}", help="Add keyword", use_container_width=True):
                                    if _new_skill and _new_skill.strip():
                                        # Ensure cache entry exists for manual jobs
                                        if _jid not in cache:
                                            from services.keyword_profile import save_keyword_cache as _save_kc
                                            cache[_jid] = {"keywords": [], "extracted_at": ""}
                                            _save_kc(cache)
                                        add_keyword_to_job(_jid, _new_skill.strip(), _new_cat)
                                        st.rerun()

        # ── Warning for jobs without keyword data ──
        if jobs_without_reqs:
            with st.expander(f"⚠️ {len(jobs_without_reqs)} job(s) without keyword data", expanded=False):
                st.caption("These jobs were added manually or have no linked session with requirements.")
                for j in jobs_without_reqs:
                    st.markdown(f"- **{j['title']}** @ {j['company']}")

elif st.session_state.page == "cover_letter" and st.session_state.resume_data and st.session_state.selected_job:
    # ============== Cover Letter Page ==============
    import uuid as cl_uuid
    job = st.session_state.selected_job

    # Header bar
    st.markdown(f"""
        <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%);
                    padding: 15px 20px; border-radius: 10px; color: white; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 0.85rem; opacity: 0.9;">📝 Cover Letter for:</div>
                    <div style="font-size: 1.3rem; font-weight: 700;">{job.get('title') if job.get('company', '').lower() in job.get('title', '').lower() else job.get('title') + ' @ ' + job.get('company', '')}</div>
                </div>
            </div>
        </div>
    """, unsafe_allow_html=True)

    col_edit, col_chat = st.columns([1.3, 1])

    with col_edit:
        # Application question input
        cl_question = st.text_area(
            "Application Question (optional)",
            value=st.session_state.cover_letter_question,
            placeholder="e.g., Why do you want to work at this company? (Leave empty for a general cover letter)",
            height=80,
            key="cl_question_input"
        )
        if cl_question != st.session_state.cover_letter_question:
            st.session_state.cover_letter_question = cl_question

        # Custom instructions
        st.text_area(
            "Custom instructions (optional)",
            placeholder="e.g., Emphasize my leadership experience, keep the tone casual, focus on cloud architecture skills...",
            height=80,
            key="cl_custom_instructions"
        )

        # Buttons row
        btn_col1, btn_col2, btn_col3 = st.columns([1, 1, 2])
        with btn_col1:
            has_letter = bool(st.session_state.cover_letter_text.strip())
            gen_label = "🔄 Regenerate" if has_letter else "✨ Generate"
            if st.button(gen_label, type="primary"):
                with st.spinner("Generating cover letter..."):
                    result = generate_cover_letter(
                        resume_data=st.session_state.resume_data,
                        target_job=job,
                        question=st.session_state.cover_letter_question,
                        model_choice=model,
                        api_key=api_key,
                        previous_letter=st.session_state.cover_letter_text if has_letter else None,
                        custom_instructions=st.session_state.get("cl_custom_instructions", "")
                    )
                    if result.get("success"):
                        st.session_state.cover_letter_text = result["cover_letter"]
                        st.session_state.cl_text_editor = result["cover_letter"]
                        auto_save_session()
                        st.rerun()
                    else:
                        st.error(f"Generation failed: {result.get('error', 'Unknown error')}")

        with btn_col2:
            if st.button("🔒 Humanize"):
                _ukey = _get_undetectable_key()
                if not _ukey:
                    st.warning("Please enter your Undetectable.ai API key in ⚙️ Humanize Settings, or set UNDETECTABLE_API_KEY in .env.")
                elif not st.session_state.cover_letter_text.strip():
                    st.warning("Generate a cover letter first.")
                else:
                    with st.status("🔒 Humanizing cover letter...", expanded=True) as status:
                        try:
                            settings = {
                                "strength": st.session_state.get("cl_humanize_strength", "More Human"),
                                "readability": st.session_state.get("cl_humanize_readability", "Journalist"),
                                "purpose": "Cover Letter",
                                "model": st.session_state.get("cl_humanize_model", "v11"),
                            }
                            humanized = humanize_text(
                                api_key=_ukey,
                                text=st.session_state.cover_letter_text,
                                settings=settings,
                                progress_callback=lambda stage, detail: status.update(label=f"🔒 {detail}")
                            )
                            st.session_state.cover_letter_text = humanized
                            st.session_state.cl_text_editor = humanized
                            status.update(label="🔒 Humanization complete!", state="complete")
                            auto_save_session()
                            st.rerun()
                        except Exception as e:
                            st.error(f"Humanization error: {str(e)}")

        with btn_col3:
            with st.expander("⚙️ Humanize Settings"):
                st.markdown(
                    "Powered by [**Undetectable.ai**](https://undetectable.ai) — "
                    "rewrites AI-generated text to sound more natural and bypass AI detectors. "
                    "Enter your API key below, or set `UNDETECTABLE_API_KEY` in `.env`."
                )
                if not st.session_state.get("undetectable_api_key_input"):
                    st.text_input(
                        "🔑 Undetectable.ai API Key",
                        type="password",
                        key="cl_undetectable_api_key_input",
                        placeholder="Paste your Undetectable.ai API key here",
                    )
                else:
                    st.caption("🔑 Using API key from Resume Humanize settings")
                _hc1, _hc2 = st.columns(2)
                with _hc1:
                    st.selectbox("Strength", ["Quality", "Balanced", "More Human"], index=2, key="cl_humanize_strength")
                with _hc2:
                    st.selectbox("Readability", ["High School", "University", "Doctorate", "Journalist", "Marketing"], index=3, key="cl_humanize_readability")
                st.selectbox("Model", ["v11", "v11sr", "v2"], index=0, key="cl_humanize_model",
                             help="v11: English-optimized | v11sr: Best English, slower | v2: Multilingual")
                _ukey = _get_undetectable_key()
                if _ukey:
                    try:
                        _credits = check_credits(_ukey)
                        st.caption(f"💰 Credits: {_credits.get('credits', 'N/A')}")
                    except Exception:
                        st.caption("💰 Credits: unable to check")

        # Editable cover letter text area
        st.markdown("### Your Cover Letter")
        cl_text = st.text_area(
            "Cover letter content",
            value=st.session_state.cover_letter_text,
            height=400,
            key="cl_text_editor",
            label_visibility="collapsed",
            placeholder="Click 'Generate' to create a cover letter, or paste your own text here."
        )
        if cl_text != st.session_state.cover_letter_text:
            st.session_state.cover_letter_text = cl_text
            auto_save_session()

        # Bottom toolbar
        if st.session_state.cover_letter_text.strip():
            btm_col1, btm_col2, btm_col3 = st.columns([1, 1, 2])
            with btm_col1:
                st.download_button(
                    "⬇️ Download .txt",
                    st.session_state.cover_letter_text,
                    file_name="cover_letter.txt",
                    mime="text/plain",
                    use_container_width=True
                )
            with btm_col2:
                if st.button("📋 Copy", use_container_width=True):
                    st.toast("Use Ctrl+A then Ctrl+C in the text area above to copy.")
            with btm_col3:
                word_count = len(st.session_state.cover_letter_text.split())
                st.caption(f"📊 {word_count} words | {len(st.session_state.cover_letter_text)} characters")

    # Right column: AI Co-Pilot
    with col_chat:
        st.markdown("### 🤖 AI Co-Pilot")

        # Handle trigger actions
        if st.session_state.cl_trigger_action:
            action = st.session_state.cl_trigger_action
            st.session_state.cl_trigger_action = None

            if action['type'] == "apply_suggestion":
                prompt = f"Apply suggestion: {action['payload']}"
                st.session_state.cl_timeline.append({
                    "id": str(cl_uuid.uuid4()), "role": "user", "type": "chat", "content": prompt, "meta": {}
                })
                with st.spinner("Applying..."):
                    result = edit_cover_letter(
                        prompt,
                        st.session_state.cover_letter_text,
                        st.session_state.resume_data,
                        job,
                        st.session_state.cl_timeline[:-1],
                        model, api_key
                    )
                    if result.get("type") == "edit" and result.get("cover_letter"):
                        snapshot = st.session_state.cover_letter_text
                        st.session_state.cover_letter_text = result["cover_letter"]
                        st.session_state.cl_text_editor = result["cover_letter"]
                        st.session_state.cl_timeline.append({
                            "id": str(cl_uuid.uuid4()),
                            "role": "assistant",
                            "type": "edit",
                            "content": result.get("message", "Applied."),
                            "meta": {"snapshot_before": snapshot, "data_applied": result["cover_letter"]},
                            "is_reverted": False
                        })
                        auto_save_session()
                st.rerun()

            elif action['type'] == "revert":
                for item in st.session_state.cl_timeline:
                    if item['id'] == action['payload']:
                        st.session_state.cover_letter_text = item['meta']['snapshot_before']
                        st.session_state.cl_text_editor = item['meta']['snapshot_before']
                        item['is_reverted'] = True
                        auto_save_session()
                        break
                st.rerun()

            elif action['type'] == "redo":
                for item in st.session_state.cl_timeline:
                    if item['id'] == action['payload']:
                        st.session_state.cover_letter_text = item['meta']['data_applied']
                        st.session_state.cl_text_editor = item['meta']['data_applied']
                        item['is_reverted'] = False
                        auto_save_session()
                        break
                st.rerun()

        # Chat history display
        chat_container = st.container(height=500)
        with chat_container:
            if not st.session_state.cl_timeline:
                st.caption("Ask the AI to refine your cover letter. Try: 'Make the tone more confident' or 'Add more about my leadership experience'.")

            for item in st.session_state.cl_timeline:
                if item['role'] == 'user':
                    with st.chat_message("user"):
                        st.write(item['content'])
                else:
                    with st.chat_message("assistant"):
                        st.write(item['content'])

                        if item['type'] == 'suggestion':
                            for idx, sugg in enumerate(item['meta'].get('list', [])):
                                c1, c2 = st.columns([4, 1])
                                c1.markdown(f"<div style='background: #f0fdf4; padding: 8px 12px; border-radius: 6px; border-left: 3px solid #22c55e; margin: 4px 0; font-size: 0.9rem;'>{sugg}</div>", unsafe_allow_html=True)
                                if c2.button("Apply", key=f"cls_{item['id']}_{idx}"):
                                    st.session_state.cl_trigger_action = {"type": "apply_suggestion", "payload": sugg}
                                    st.rerun()

                        elif item['type'] == 'edit':
                            is_rev = item.get('is_reverted', False)
                            if is_rev:
                                st.markdown("<div style='background: #fef3c7; padding: 6px 10px; border-radius: 4px; font-size: 0.85rem;'>↩️ Reverted</div>", unsafe_allow_html=True)
                                if st.button("Redo", key=f"clr_{item['id']}"):
                                    st.session_state.cl_trigger_action = {"type": "redo", "payload": item['id']}
                                    st.rerun()
                            else:
                                st.markdown("<div style='background: #dcfce7; padding: 6px 10px; border-radius: 4px; font-size: 0.85rem;'>✅ Applied</div>", unsafe_allow_html=True)
                                if st.button("Revert", key=f"clu_{item['id']}"):
                                    st.session_state.cl_trigger_action = {"type": "revert", "payload": item['id']}
                                    st.rerun()

        # Chat input
        if prompt := st.chat_input("Ask me to modify your cover letter..."):
            if not st.session_state.cover_letter_text.strip():
                st.warning("Generate a cover letter first before using the co-pilot.")
            else:
                st.session_state.cl_timeline.append({
                    "id": str(cl_uuid.uuid4()), "role": "user", "type": "chat", "content": prompt, "meta": {}
                })

                with chat_container:
                    with st.chat_message("user"):
                        st.write(prompt)
                    with st.chat_message("assistant"):
                        with st.spinner("Thinking..."):
                            result = edit_cover_letter(
                                prompt,
                                st.session_state.cover_letter_text,
                                st.session_state.resume_data,
                                job,
                                st.session_state.cl_timeline[:-1],
                                model, api_key
                            )

                            if result.get("type") == "edit" and result.get("cover_letter"):
                                snapshot = st.session_state.cover_letter_text
                                st.session_state.cover_letter_text = result["cover_letter"]
                                st.session_state.cl_text_editor = result["cover_letter"]
                                st.session_state.cl_timeline.append({
                                    "id": str(cl_uuid.uuid4()),
                                    "role": "assistant",
                                    "type": "edit",
                                    "content": result.get("message", "Changes applied."),
                                    "meta": {"snapshot_before": snapshot, "data_applied": result["cover_letter"]},
                                    "is_reverted": False
                                })
                            elif result.get("type") == "suggestion":
                                st.session_state.cl_timeline.append({
                                    "id": str(cl_uuid.uuid4()),
                                    "role": "assistant",
                                    "type": "suggestion",
                                    "content": result.get("message", "Suggestions:"),
                                    "meta": {"list": result.get("suggestion_list", [])}
                                })
                            else:
                                st.session_state.cl_timeline.append({
                                    "id": str(cl_uuid.uuid4()),
                                    "role": "assistant",
                                    "type": "chat",
                                    "content": result.get("message", "How can I help?"),
                                    "meta": {}
                                })
                            auto_save_session()

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