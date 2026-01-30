"""
Mock Interview Service - AI-powered voice interview simulation
Supports: TTS (Text-to-Speech), STT (Speech-to-Text), Question Generation, Answer Evaluation
"""
import json
import base64
from io import BytesIO
from openai import OpenAI


def text_to_speech(text: str, api_key: str, voice: str = "alloy") -> bytes:
    """Convert text to speech using OpenAI TTS.
    
    Args:
        text: The text to convert to speech
        api_key: OpenAI API key
        voice: Voice option (alloy, echo, fable, onyx, nova, shimmer)
    
    Returns:
        Audio bytes in MP3 format
    """
    client = OpenAI(api_key=api_key)
    
    response = client.audio.speech.create(
        model="tts-1",
        voice=voice,
        input=text
    )
    
    return response.content


def speech_to_text(audio_bytes: bytes, api_key: str) -> str:
    """Transcribe audio to text using OpenAI Whisper.
    
    Args:
        audio_bytes: Audio data in bytes
        api_key: OpenAI API key
    
    Returns:
        Transcribed text string
    """
    client = OpenAI(api_key=api_key)
    
    # Whisper requires a file-like object with a name
    audio_file = BytesIO(audio_bytes)
    audio_file.name = "recording.wav"
    
    transcription = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file
    )
    
    return transcription.text


def generate_interview_questions(resume_data: dict, job_data: dict, api_key: str, num_questions: int = 5) -> dict:
    """Generate interview questions tailored to resume gaps and job requirements.
    
    Args:
        resume_data: Parsed resume JSON data
        job_data: Target job information
        api_key: OpenAI API key
        num_questions: Number of questions to generate
    
    Returns:
        Dictionary containing list of interview questions
    """
    client = OpenAI(api_key=api_key)
    
    prompt = f"""You are an expert interviewer for the position of {job_data.get('title', 'Unknown')} at {job_data.get('company', 'Unknown')}.

CANDIDATE RESUME:
{json.dumps(resume_data, ensure_ascii=False, indent=2)}

JOB REQUIREMENTS:
{job_data.get('requirements', [])}

JOB DESCRIPTION:
{job_data.get('description', '')}

IDENTIFIED GAPS (areas where candidate may be weak):
{job_data.get('gaps', [])}

Generate exactly {num_questions} interview questions that:
1. Test the candidate's claimed skills and experience from their resume
2. Probe areas where the resume shows gaps compared to job requirements
3. Include a mix of behavioral (STAR method) and technical questions
4. Progress from easier to more challenging questions

Return JSON in this exact format:
{{
    "questions": [
        {{
            "question": "The full interview question text",
            "type": "behavioral" or "technical",
            "focus_area": "What skill or gap this question tests",
            "difficulty": "easy" or "medium" or "hard",
            "good_answer_hints": ["Key point 1 a strong answer should include", "Key point 2"]
        }}
    ]
}}

Make questions conversational and professional, as a real interviewer would ask them.
Return ONLY valid JSON."""

    response = client.chat.completions.create(
        model="gpt-5.2",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    
    return json.loads(response.choices[0].message.content)


def evaluate_answer(question: dict, user_answer: str, resume_data: dict, job_data: dict, api_key: str) -> dict:
    """Evaluate the candidate's answer and provide detailed feedback.
    
    Args:
        question: The question dictionary
        user_answer: Transcribed user answer
        resume_data: Parsed resume JSON data
        job_data: Target job information
        api_key: OpenAI API key
    
    Returns:
        Dictionary containing score and feedback
    """
    client = OpenAI(api_key=api_key)
    
    prompt = f"""You are an expert interviewer evaluating a candidate's response for the position of {job_data.get('title', 'Unknown')}.

INTERVIEW QUESTION:
"{question.get('question', '')}"

QUESTION TYPE: {question.get('type', 'general')}
FOCUS AREA: {question.get('focus_area', 'general skills')}
DIFFICULTY: {question.get('difficulty', 'medium')}

WHAT A GOOD ANSWER SHOULD INCLUDE:
{question.get('good_answer_hints', [])}

CANDIDATE'S ACTUAL ANSWER:
"{user_answer}"

CANDIDATE'S RESUME (for context and fact-checking):
{json.dumps(resume_data, ensure_ascii=False, indent=2)}

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
Return ONLY valid JSON."""

    response = client.chat.completions.create(
        model="gpt-5.2",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    
    return json.loads(response.choices[0].message.content)


def generate_interview_summary(interview_history: list, job_data: dict, api_key: str) -> dict:
    """Generate a comprehensive summary after the interview is complete.
    
    Args:
        interview_history: List of question/answer/evaluation records
        job_data: Target job information
        api_key: OpenAI API key
    
    Returns:
        Dictionary containing overall assessment and recommendations
    """
    client = OpenAI(api_key=api_key)
    
    # Prepare history summary
    history_text = ""
    for i, h in enumerate(interview_history, 1):
        history_text += f"""
Question {i}: {h['question'].get('question', '')}
Answer: {h['answer']}
Score: {h['evaluation'].get('score', 'N/A')}/10
"""
    
    prompt = f"""You are an expert career coach providing a post-interview assessment.

POSITION: {job_data.get('title', 'Unknown')} at {job_data.get('company', 'Unknown')}

INTERVIEW PERFORMANCE:
{history_text}

Provide a comprehensive summary:
{{
    "overall_score": <average score 1-10>,
    "overall_assessment": "2-3 sentence summary of interview performance",
    "top_strengths": ["Strength 1 demonstrated across answers", "Strength 2"],
    "key_improvement_areas": ["Area 1 to work on", "Area 2"],
    "readiness_level": "Ready" or "Almost Ready" or "Needs Preparation",
    "recommended_actions": [
        "Specific action 1 to prepare for real interviews",
        "Specific action 2",
        "Specific action 3"
    ],
    "encouraging_message": "A motivating closing message for the candidate"
}}

Return ONLY valid JSON."""

    response = client.chat.completions.create(
        model="gpt-5.2",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    
    return json.loads(response.choices[0].message.content)


# ============================================================================
# UI Component Rendering Functions
# These functions generate HTML/JavaScript for the interview interface,
# keeping UI logic separate from app.py
# ============================================================================

def render_recording_component(question_audio_b64: str, countdown_seconds: int = 30) -> str:
    """Generate the HTML/JavaScript component for voice recording interface.
    
    This encapsulates all the UI logic, JavaScript, and styling for the interview
    recording interface, keeping it separate from the main app.py file.
    
    NOTE: The full implementation with all JavaScript logic should be moved here
    from app.py. This is a placeholder showing the structure.
    
    Args:
        question_audio_b64: Base64-encoded audio data for the question
        countdown_seconds: Recording countdown duration (default 30)
    
    Returns:
        Complete HTML string with embedded JavaScript for the recording component
    """
    # TODO: Move the complete HTML/JS from app.py lines 898-1172 here
    # For now, this is a structural placeholder
    return f"<!-- Recording component placeholder - full implementation should be moved from app.py -->"


def render_transcript_bridge() -> str:
    """Generate JavaScript to bridge transcript from localStorage to Streamlit textarea.
    
    Returns:
        JavaScript code as string to sync transcript from localStorage to textarea
    """
    return """
    <script>
        function syncTranscript() {
            const complete = localStorage.getItem('recordingComplete') === 'true';
            const t = localStorage.getItem('interviewTranscript') || '';
            
            if (complete && t.length > 0) {
                const textareas = parent.document.querySelectorAll('textarea');
                let target = null;
                
                for (let i = 0; i < textareas.length; i++) {
                    const ta = textareas[i];
                    if (!ta.disabled && !ta.readOnly) {
                        target = ta;
                    }
                }
                
                if (target && target.value !== t) {
                    target.value = t;
                    target.dispatchEvent(new Event('input', {bubbles: true}));
                    target.dispatchEvent(new Event('change', {bubbles: true}));
                    target.style.backgroundColor = '#f0fdf4';
                    target.style.borderColor = '#166534';
                }
            }
        }
        setInterval(syncTranscript, 500);
    </script>
    """

