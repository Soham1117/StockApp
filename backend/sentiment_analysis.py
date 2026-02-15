"""
News sentiment analysis using FinBERT model.
Analyzes news articles and generates sentiment scores.
"""

from typing import List, Dict, Any, Optional
import numpy as np


def analyze_news_sentiment_batch(
    headlines: List[str],
    summaries: List[str],
    model,
    tokenizer,
    max_length: int = 512
) -> List[Dict[str, Any]]:
    """
    Analyze sentiment for a batch of news articles using FinBERT.

    Args:
        headlines: List of news headlines
        summaries: List of news summaries/content
        model: FinBERT model
        tokenizer: FinBERT tokenizer
        max_length: Max token length for model input

    Returns:
        List of sentiment results with scores and labels
    """
    import torch

    results = []

    for headline, summary in zip(headlines, summaries):
        # Combine headline and summary (prefer summary if available)
        text = summary if summary and len(summary.strip()) > 20 else headline
        if not text or len(text.strip()) < 5:
            results.append({
                "sentiment": "neutral",
                "score": 0.0,
                "confidence": 0.0
            })
            continue

        # Tokenize
        try:
            inputs = tokenizer(
                text,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=max_length
            )

            # Get model predictions
            with torch.no_grad():
                outputs = model(**inputs)
                predictions = torch.nn.functional.softmax(outputs.logits, dim=-1)

            # FinBERT outputs: [positive, negative, neutral]
            probs = predictions[0].cpu().numpy()
            positive_prob = float(probs[0])
            negative_prob = float(probs[1])
            neutral_prob = float(probs[2])

            # Determine sentiment
            max_prob = max(positive_prob, negative_prob, neutral_prob)
            if max_prob == positive_prob:
                sentiment_label = "positive"
                sentiment_score = positive_prob - negative_prob  # Range: -1 to +1
            elif max_prob == negative_prob:
                sentiment_label = "negative"
                sentiment_score = positive_prob - negative_prob  # Negative value
            else:
                sentiment_label = "neutral"
                sentiment_score = 0.0

            results.append({
                "sentiment": sentiment_label,
                "score": round(sentiment_score, 3),
                "confidence": round(max_prob, 3),
                "positive_prob": round(positive_prob, 3),
                "negative_prob": round(negative_prob, 3),
                "neutral_prob": round(neutral_prob, 3)
            })

        except Exception as e:
            print(f"[sentiment] Error analyzing text: {e}")
            results.append({
                "sentiment": "neutral",
                "score": 0.0,
                "confidence": 0.0,
                "error": str(e)
            })

    return results


def aggregate_sentiment(
    sentiment_results: List[Dict[str, Any]],
    recent_days: int = 30
) -> Dict[str, Any]:
    """
    Aggregate sentiment scores from multiple articles.

    Args:
        sentiment_results: List of sentiment analysis results
        recent_days: Number of days to consider as "recent"

    Returns:
        Aggregated sentiment metrics
    """
    if not sentiment_results:
        return {
            "avg_sentiment": None,
            "recent_sentiment": None,
            "positive_pct": None,
            "negative_pct": None,
            "neutral_pct": None,
            "article_count": 0
        }

    scores = [r["score"] for r in sentiment_results if "score" in r]
    sentiments = [r["sentiment"] for r in sentiment_results if "sentiment" in r]

    # Calculate averages
    avg_sentiment = np.mean(scores) if scores else 0.0

    # Recent sentiment (first N articles, assuming they're sorted by date desc)
    recent_count = min(recent_days, len(scores))
    recent_scores = scores[:recent_count] if recent_count > 0 else []
    recent_sentiment = np.mean(recent_scores) if recent_scores else avg_sentiment

    # Sentiment distribution
    positive_count = sentiments.count("positive")
    negative_count = sentiments.count("negative")
    neutral_count = sentiments.count("neutral")
    total = len(sentiments)

    return {
        "avg_sentiment": round(float(avg_sentiment), 3),
        "recent_sentiment": round(float(recent_sentiment), 3),
        "positive_pct": round((positive_count / total) * 100, 1) if total > 0 else 0,
        "negative_pct": round((negative_count / total) * 100, 1) if total > 0 else 0,
        "neutral_pct": round((neutral_count / total) * 100, 1) if total > 0 else 0,
        "article_count": total,
        "recent_article_count": recent_count
    }


def calculate_analyst_rating_score(
    strong_buy: int,
    buy: int,
    hold: int,
    sell: int,
    strong_sell: int
) -> float:
    """
    Calculate analyst rating score (0-100) from recommendation counts.

    Weights:
        Strong Buy: 100
        Buy: 75
        Hold: 50
        Sell: 25
        Strong Sell: 0

    Returns:
        Weighted average score 0-100
    """
    total = strong_buy + buy + hold + sell + strong_sell
    if total == 0:
        return 50.0  # Neutral if no ratings

    weighted_sum = (
        strong_buy * 100 +
        buy * 75 +
        hold * 50 +
        sell * 25 +
        strong_sell * 0
    )

    return weighted_sum / total
