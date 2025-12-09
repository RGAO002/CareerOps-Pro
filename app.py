"""
CareerOps Pro - Main Entry Point
AI-Powered Resume Analysis & Optimization Platform
"""
import streamlit as st
import os
import base64
import copy
from io import BytesIO
from pypdf import PdfReader
from dotenv import load_dotenv

from services.resume_parser import parse_resume, parse_resume_from_image, is_scanned_pdf
from services.resume_analyzer import analyze_resume
from services.job_matcher import match_jobs, SAMPLE_JOBS
from services.resume_editor import edit_resume
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
    st.session_state.page = "analysis"  # analysis | editor
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
    
    model = st.selectbox("🧠 AI Model", ["gpt-4o", "gpt-3.5-turbo", "claude-3-5-sonnet-20241022"])
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
