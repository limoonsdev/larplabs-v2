#!/usr/bin/env python3
"""
CreamyViews Backend - Entry Point
Run with: python start.py
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        workers=1,
        log_level="info",
        access_log=True,
    )
