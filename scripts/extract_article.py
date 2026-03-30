#!/usr/bin/env python3
"""
기사 본문 추출 스크립트 (newspaper3k)
Usage: python3 extract_article.py <url>
stdout: JSON { title, text, authors, publish_date, top_image, summary, keywords }
"""

import sys
import json

try:
    from newspaper import Article
except ImportError:
    print(json.dumps({"error": "newspaper3k not installed. Run: pip3 install newspaper3k"}))
    sys.exit(1)

def extract(url: str) -> dict:
    try:
        article = Article(url, language='ko')
        article.download()
        article.parse()

        # NLP (요약/키워드) - 실패해도 본문은 반환
        try:
            article.nlp()
            summary = article.summary
            keywords = article.keywords
        except Exception:
            summary = ''
            keywords = []

        return {
            "title": article.title or '',
            "text": article.text or '',
            "authors": article.authors or [],
            "publish_date": str(article.publish_date) if article.publish_date else '',
            "top_image": article.top_image or '',
            "summary": summary,
            "keywords": keywords,
        }
    except Exception as e:
        return {"error": str(e), "text": ""}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "URL argument required"}))
        sys.exit(1)

    result = extract(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False))
