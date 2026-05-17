"""
ATS adapter layer — fetch structured job data from public ATS JSON APIs.

Each adapter inherits from ATSAdapter and yields vendor-agnostic RawJob objects.
The orchestrator routes companies to the right adapter based on companies.ats_vendor.
"""
