# LarpLabs V2 — Backend (FastAPI + Chrome turbo + OCR captcha)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Chrome stable (nodriver) + tesseract (OCR) + libs système Chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates tesseract-ocr \
    fonts-liberation libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
 && wget -q -O /usr/share/keyrings/google-linux-signing-key.gpg https://dl.google.com/linux/linux_signing_key.pub \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux-signing-key.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt
# OCR captcha (pillow + pytesseract, binaire tesseract déjà installé ci-dessus)
RUN pip install pillow pytesseract

COPY app ./app
COPY start.py .

EXPOSE 8000
CMD ["python", "start.py"]
