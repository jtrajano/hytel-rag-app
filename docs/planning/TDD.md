# AirCare SEA — Technical Design Document

**Version:** 1.0  
**Date:** February 2026  
**Status:** Design Phase  
**Team:** 2 Members (11-Day Sprint)

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Data Models & Schemas](#2-data-models--schemas)
3. [API Specifications](#3-api-specifications)
4. [Component Design](#4-component-design)
5. [RAG Pipeline Architecture](#5-rag-pipeline-architecture)
6. [Forecasting Pipeline](#6-forecasting-pipeline)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Deployment & Infrastructure](#8-deployment--infrastructure)
9. [Security & Authentication](#9-security--authentication)
10. [Error Handling & Resilience](#10-error-handling--resilience)
11. [Monitoring & Logging](#11-monitoring--logging)
12. [Testing Strategy](#12-testing-strategy)
13. [Performance Requirements](#13-performance-requirements)
14. [Code Structure](#14-code-structure)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                              │
│                     Streamlit Web App (Cloud Run)                    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
         ┌──────────▼──────────┐   ┌─────────▼──────────┐
         │   Backend API       │   │   RAG Service      │
         │   (Cloud Run)       │   │   (In-App)         │
         └──────────┬──────────┘   └─────────┬──────────┘
                    │                        │
        ┌───────────┼────────────────────────┼───────────┐
        │           │                        │           │
┌───────▼──────┐ ┌──▼─────────┐  ┌──────────▼────────┐  │
│   OpenAQ     │ │  Vertex AI │  │  Vertex AI        │  │
│   API        │ │  AutoML    │  │  Vector Search    │  │
│  (External)  │ │  Forecast  │  │  + Gemini 1.5     │  │
└──────────────┘ └──┬─────────┘  └───────────────────┘  │
                    │                                    │
             ┌──────▼────────────────────────────────────▼────┐
             │         Google Cloud Storage (GCS)             │
             │  /raw  /processed  /models  /docs  /logs       │
             └──────┬─────────────────────────────────────────┘
                    │
             ┌──────▼──────┐
             │  BigQuery   │
             │  Time Series│
             │  AQI Data   │
             └─────────────┘
```

### 1.2 Data Flow

#### Flow 1: Live AQI Query

```
User → Streamlit → Backend API → OpenAQ API → Response
                                ↓
                            GCS (cache)
```

#### Flow 2: Forecast Query

```
User → Streamlit → Backend API → Vertex AI Endpoint → Response
                                       ↓
                                  BigQuery (historical data)
```

#### Flow 3: RAG Health Q&A

```
User Question → Streamlit → RAG Service
                              ↓
                    Vertex AI Embeddings (query embedding)
                              ↓
                    Vector Search (retrieve top-5 chunks)
                              ↓
                    Gemini 1.5 Flash (synthesize answer)
                              ↓
                    Response (cited, grounded)
```

---

## 2. Data Models & Schemas

### 2.1 BigQuery Schema

#### Table: `aircare_sea.aqi_measurements`

```sql
CREATE TABLE aircare_sea.aqi_measurements (
  measurement_id STRING NOT NULL,
  city STRING NOT NULL,
  country STRING NOT NULL,
  latitude FLOAT64 NOT NULL,
  longitude FLOAT64 NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  pm25 FLOAT64,
  pm10 FLOAT64,
  no2 FLOAT64,
  o3 FLOAT64,
  co FLOAT64,
  aqi_value INT64,
  aqi_category STRING,  -- 'Good', 'Moderate', 'Unhealthy', etc.
  source STRING,  -- 'openaq'
  ingestion_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(timestamp)
CLUSTER BY city, country;
```

#### Table: `aircare_sea.forecast_outputs`

```sql
CREATE TABLE aircare_sea.forecast_outputs (
  forecast_id STRING NOT NULL,
  city STRING NOT NULL,
  forecast_timestamp TIMESTAMP NOT NULL,  -- when forecast was made
  predicted_timestamp TIMESTAMP NOT NULL,  -- what time is being predicted
  predicted_pm25 FLOAT64,
  confidence_lower FLOAT64,
  confidence_upper FLOAT64,
  model_version STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(forecast_timestamp)
CLUSTER BY city;
```

### 2.2 Vector Search Document Schema

```json
{
  "id": "doc_001_chunk_005",
  "embedding": [0.123, -0.456, ...],  // 768-dim vector
  "metadata": {
    "source": "WHO Air Quality Guidelines 2021",
    "document_title": "Health Effects of PM2.5",
    "section": "Section 3.2",
    "page": 45,
    "pollutant_tags": ["PM2.5", "respiratory", "asthma"],
    "content": "Children and individuals with pre-existing respiratory...",
    "chunk_index": 5,
    "total_chunks": 23,
    "ingestion_date": "2026-02-10"
  }
}
```

### 2.3 Application Data Models

#### Python Data Classes

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List

@dataclass
class AQIMeasurement:
    city: str
    country: str
    latitude: float
    longitude: float
    timestamp: datetime
    pm25: Optional[float]
    pm10: Optional[float]
    no2: Optional[float]
    aqi_value: int
    aqi_category: str

@dataclass
class ForecastPoint:
    timestamp: datetime
    predicted_pm25: float
    confidence_lower: float
    confidence_upper: float

@dataclass
class HealthProfile:
    sensitivity: str  # 'healthy', 'asthma', 'pregnant', 'elderly', 'child'
    custom_conditions: List[str] = None

@dataclass
class RAGResponse:
    answer: str
    sources: List[str]
    retrieved_chunks: List[dict]
    confidence_score: float
```

---

## 3. API Specifications

### 3.1 Backend API Endpoints

**Base URL:** `https://aircare-api-[hash].run.app`

#### GET `/api/v1/aqi/current`

Fetch current AQI for a city.

**Request:**

```http
GET /api/v1/aqi/current?city=Manila&country=Philippines
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "city": "Manila",
    "country": "Philippines",
    "timestamp": "2026-02-18T08:30:00Z",
    "aqi": 158,
    "category": "Unhealthy",
    "pollutants": {
      "pm25": 68.4,
      "pm10": 102.1,
      "no2": 45.2
    },
    "primary_pollutant": "PM2.5",
    "coordinates": {
      "latitude": 14.5995,
      "longitude": 120.9842
    }
  },
  "cached": false,
  "cache_age_seconds": 0
}
```

**Error Response:**

```json
{
  "status": "error",
  "error": {
    "code": "CITY_NOT_FOUND",
    "message": "No AQI data available for the specified city",
    "timestamp": "2026-02-18T08:30:00Z"
  }
}
```

---

#### GET `/api/v1/forecast/72h`

Get 72-hour AQI forecast for a city.

**Request:**

```http
GET /api/v1/forecast/72h?city=Manila&country=Philippines
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "city": "Manila",
    "country": "Philippines",
    "forecast_generated_at": "2026-02-18T08:00:00Z",
    "model_version": "automl-v1-20260215",
    "predictions": [
      {
        "timestamp": "2026-02-18T09:00:00Z",
        "hours_ahead": 1,
        "predicted_pm25": 72.1,
        "predicted_aqi": 160,
        "confidence_interval": {
          "lower": 65.4,
          "upper": 78.8,
          "confidence_level": 0.9
        }
      },
      {
        "timestamp": "2026-02-18T12:00:00Z",
        "hours_ahead": 4,
        "predicted_pm25": 68.3,
        "predicted_aqi": 155,
        "confidence_interval": {
          "lower": 59.2,
          "upper": 77.4,
          "confidence_level": 0.9
        }
      }
      // ... 72 hourly predictions total
    ],
    "summary": {
      "max_aqi": 168,
      "min_aqi": 142,
      "average_aqi": 156,
      "worst_period": "2026-02-19 07:00-10:00 UTC"
    }
  }
}
```

---

#### POST `/api/v1/rag/ask`

Ask a health-related question (RAG-powered).

**Request:**

```http
POST /api/v1/rag/ask
Content-Type: application/json

{
  "question": "Should I jog outside today if I have asthma?",
  "context": {
    "city": "Manila",
    "current_aqi": 158,
    "health_profile": "asthma",
    "forecast_next_3h": [160, 162, 155]
  }
}
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "answer": "Based on current AQI of 158 (Unhealthy) in Manila and your asthma condition, outdoor jogging is not recommended today. WHO guidelines classify individuals with asthma as a sensitive group who should avoid prolonged outdoor exertion above AQI 150. Consider indoor exercise or postpone until AQI drops below 100.",
    "sources": [
      {
        "title": "WHO Air Quality Guidelines 2021",
        "section": "Health Recommendations for Sensitive Groups",
        "relevance_score": 0.89
      },
      {
        "title": "DOH Philippines Advisory PH-2023-08",
        "section": "Outdoor Activity Guidelines",
        "relevance_score": 0.82
      }
    ],
    "recommendation": "avoid_outdoor_exercise",
    "confidence": 0.94,
    "retrieved_chunks_count": 5
  }
}
```

---

### 3.2 OpenAQ API Integration

**Endpoint:** `https://api.openaq.org/v2/latest`

**Request:**

```http
GET https://api.openaq.org/v2/latest?city=Manila&limit=1
```

**Response (Simplified):**

```json
{
  "results": [
    {
      "location": "Manila",
      "city": "Manila",
      "country": "PH",
      "coordinates": {
        "latitude": 14.5995,
        "longitude": 120.9842
      },
      "measurements": [
        {
          "parameter": "pm25",
          "value": 68.4,
          "unit": "µg/m³",
          "lastUpdated": "2026-02-18T08:30:00Z"
        }
      ]
    }
  ]
}
```

---

## 4. Component Design

### 4.1 Backend API Service (Member 1)

**Technology:** Python + Flask/FastAPI  
**Deployment:** Cloud Run  
**Responsibilities:**

- Fetch live AQI from OpenAQ
- Call Vertex AI forecast endpoint
- Cache responses in GCS
- Handle rate limiting

**Directory Structure:**

```
backend/
├── app.py                 # Main Flask/FastAPI app
├── routes/
│   ├── aqi.py            # AQI endpoints
│   ├── forecast.py       # Forecast endpoints
│   └── health.py         # Health check
├── services/
│   ├── openaq_client.py  # OpenAQ API wrapper
│   ├── vertex_client.py  # Vertex AI client
│   └── cache_manager.py  # GCS caching
├── models/
│   └── schemas.py        # Pydantic models
├── utils/
│   ├── aqi_calculator.py # AQI computation
│   └── logger.py         # Structured logging
├── requirements.txt
└── Dockerfile
```

**Key Code: OpenAQ Client**

```python
# services/openaq_client.py
import requests
from datetime import datetime, timedelta
from typing import Optional
from models.schemas import AQIMeasurement

class OpenAQClient:
    BASE_URL = "https://api.openaq.org/v2"
    CACHE_TTL = 3600  # 1 hour

    def __init__(self, cache_manager):
        self.cache = cache_manager

    def get_current_aqi(self, city: str, country: str) -> Optional[AQIMeasurement]:
        # Check cache first
        cache_key = f"aqi_{city}_{country}"
        cached = self.cache.get(cache_key)
        if cached and cached['timestamp'] > datetime.utcnow() - timedelta(seconds=self.CACHE_TTL):
            return AQIMeasurement(**cached['data'])

        # Fetch from API
        response = requests.get(
            f"{self.BASE_URL}/latest",
            params={"city": city, "country": country, "limit": 1},
            timeout=10
        )

        if response.status_code != 200:
            raise Exception(f"OpenAQ API error: {response.status_code}")

        data = response.json()
        if not data.get('results'):
            return None

        # Parse and cache
        result = self._parse_measurement(data['results'][0])
        self.cache.set(cache_key, {
            'data': result.__dict__,
            'timestamp': datetime.utcnow()
        })

        return result

    def _parse_measurement(self, raw_data: dict) -> AQIMeasurement:
        measurements = {m['parameter']: m['value'] for m in raw_data['measurements']}

        return AQIMeasurement(
            city=raw_data['city'],
            country=raw_data['country'],
            latitude=raw_data['coordinates']['latitude'],
            longitude=raw_data['coordinates']['longitude'],
            timestamp=datetime.fromisoformat(raw_data['measurements'][0]['lastUpdated']),
            pm25=measurements.get('pm25'),
            pm10=measurements.get('pm10'),
            no2=measurements.get('no2'),
            aqi_value=self._calculate_aqi(measurements),
            aqi_category=self._categorize_aqi(self._calculate_aqi(measurements))
        )

    def _calculate_aqi(self, measurements: dict) -> int:
        # Simplified AQI calculation (use EPA formula in production)
        pm25 = measurements.get('pm25', 0)
        if pm25 <= 12: return int(pm25 * 4.17)
        elif pm25 <= 35.4: return int(50 + (pm25 - 12) * 2.13)
        elif pm25 <= 55.4: return int(100 + (pm25 - 35.4) * 2.5)
        elif pm25 <= 150.4: return int(150 + (pm25 - 55.4) * 0.53)
        else: return int(200 + (pm25 - 150.4) * 1.05)

    def _categorize_aqi(self, aqi: int) -> str:
        if aqi <= 50: return "Good"
        elif aqi <= 100: return "Moderate"
        elif aqi <= 150: return "Unhealthy for Sensitive Groups"
        elif aqi <= 200: return "Unhealthy"
        elif aqi <= 300: return "Very Unhealthy"
        else: return "Hazardous"
```

---

### 4.2 RAG Service (Member 2)

**Technology:** Python + LangChain + Vertex AI  
**Location:** Integrated into Streamlit app  
**Responsibilities:**

- Embed user questions
- Query Vector Search
- Synthesize with Gemini
- Format citations

**Key Code: RAG Pipeline**

```python
# services/rag_service.py
from vertexai.language_models import TextEmbeddingModel
from vertexai.generative_models import GenerativeModel
from google.cloud import aiplatform_v1
from typing import List, Dict

class RAGService:
    def __init__(self, project_id: str, location: str, index_endpoint: str):
        self.project_id = project_id
        self.location = location
        self.index_endpoint = index_endpoint

        # Initialize models
        self.embedding_model = TextEmbeddingModel.from_pretrained("text-embedding-004")
        self.llm = GenerativeModel("gemini-1.5-flash-002")

        # Vector Search client
        self.vector_client = aiplatform_v1.MatchServiceClient(
            client_options={"api_endpoint": f"{location}-aiplatform.googleapis.com"}
        )

    def ask(self, question: str, context: dict) -> Dict:
        # Step 1: Embed the question
        query_embedding = self._embed_query(question)

        # Step 2: Retrieve relevant chunks
        retrieved_chunks = self._retrieve_chunks(query_embedding, top_k=5)

        # Step 3: Build prompt with context
        prompt = self._build_prompt(question, context, retrieved_chunks)

        # Step 4: Generate answer with Gemini
        response = self.llm.generate_content(prompt)

        # Step 5: Format response
        return {
            "answer": response.text,
            "sources": self._extract_sources(retrieved_chunks),
            "retrieved_chunks": retrieved_chunks,
            "confidence_score": self._calculate_confidence(retrieved_chunks)
        }

    def _embed_query(self, text: str) -> List[float]:
        embeddings = self.embedding_model.get_embeddings([text])
        return embeddings[0].values

    def _retrieve_chunks(self, query_embedding: List[float], top_k: int = 5) -> List[Dict]:
        # Call Vector Search
        request = aiplatform_v1.FindNeighborsRequest(
            index_endpoint=self.index_endpoint,
            deployed_index_id="aircare_docs_deployed",
            queries=[
                aiplatform_v1.FindNeighborsRequest.Query(
                    datapoint=aiplatform_v1.IndexDatapoint(
                        feature_vector=query_embedding
                    ),
                    neighbor_count=top_k
                )
            ]
        )

        response = self.vector_client.find_neighbors(request)

        # Parse results
        chunks = []
        for neighbor in response.nearest_neighbors[0].neighbors:
            chunks.append({
                "id": neighbor.datapoint.datapoint_id,
                "distance": neighbor.distance,
                "metadata": neighbor.datapoint.restricts  # Contains source, title, content
            })

        return chunks

    def _build_prompt(self, question: str, context: dict, chunks: List[Dict]) -> str:
        # Extract chunk content
        retrieved_context = "\n\n".join([
            f"[Source: {c['metadata']['source']}]\n{c['metadata']['content']}"
            for c in chunks
        ])

        prompt = f"""You are AirCare SEA, a health assistant for Southeast Asian users.

Current Context:
- City: {context.get('city', 'Unknown')}
- Current AQI: {context.get('current_aqi', 'Unknown')}
- User Health Profile: {context.get('health_profile', 'general population')}
- 3-Hour Forecast: {context.get('forecast_next_3h', 'Not available')}

Retrieved Health Guidelines:
{retrieved_context}

User Question: {question}

Instructions:
1. Answer based ONLY on the retrieved health guidelines above
2. If the guidelines don't contain relevant info, say "I don't have enough information"
3. Always cite your sources using the format [Source: document name]
4. Be specific and actionable
5. End with a clear recommendation (e.g., "avoid outdoor exercise", "wear N95 mask", "safe to proceed")

Answer:"""

        return prompt

    def _extract_sources(self, chunks: List[Dict]) -> List[Dict]:
        sources = []
        seen = set()

        for chunk in chunks:
            source_key = chunk['metadata']['source']
            if source_key not in seen:
                sources.append({
                    "title": chunk['metadata']['source'],
                    "section": chunk['metadata'].get('section', 'N/A'),
                    "relevance_score": 1 - chunk['distance']  # Convert distance to similarity
                })
                seen.add(source_key)

        return sources

    def _calculate_confidence(self, chunks: List[Dict]) -> float:
        # Average similarity score
        if not chunks:
            return 0.0
        avg_distance = sum(c['distance'] for c in chunks) / len(chunks)
        return 1 - avg_distance  # Convert to confidence
```

---

## 5. RAG Pipeline Architecture

### 5.1 Document Processing Pipeline

```
┌─────────────────┐
│  Raw Documents  │
│  (PDFs, HTML)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Text Extract   │ ──> pypdf / BeautifulSoup
│  (Python)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Chunking       │ ──> 512 tokens, 100 overlap
│  (LangChain)    │      Metadata tagging
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Embedding      │ ──> Vertex AI text-embedding-004
│  (Batch)        │      768-dim vectors
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Vector Search  │ ──> Index creation
│  Indexing       │      Deploy to endpoint
└─────────────────┘
```

### 5.2 Chunking Strategy Implementation

```python
# preprocessing/chunker.py
from langchain.text_splitter import RecursiveCharacterTextSplitter
from typing import List, Dict

class DocumentChunker:
    def __init__(self, chunk_size: int = 512, chunk_overlap: int = 100):
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=self._token_length,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

    def chunk_document(self, text: str, metadata: Dict) -> List[Dict]:
        chunks = self.splitter.split_text(text)

        chunked_docs = []
        for i, chunk in enumerate(chunks):
            chunked_docs.append({
                "id": f"{metadata['doc_id']}_chunk_{i:03d}",
                "content": chunk,
                "metadata": {
                    **metadata,
                    "chunk_index": i,
                    "total_chunks": len(chunks)
                }
            })

        return chunked_docs

    def _token_length(self, text: str) -> int:
        # Approximation: 1 token ≈ 4 characters
        return len(text) // 4
```

---

## 6. Forecasting Pipeline

### 6.1 Data Preparation

```python
# forecasting/prepare_training_data.py
from google.cloud import bigquery
import pandas as pd

def prepare_automl_dataset(
    project_id: str,
    dataset_id: str,
    output_path: str,
    lookback_days: int = 90
):
    client = bigquery.Client(project=project_id)

    query = f"""
    SELECT
      city,
      TIMESTAMP_TRUNC(timestamp, HOUR) as timestamp,
      AVG(pm25) as pm25,
      AVG(pm10) as pm10,
      AVG(no2) as no2
    FROM `{project_id}.{dataset_id}.aqi_measurements`
    WHERE DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL {lookback_days} DAY)
    GROUP BY city, TIMESTAMP_TRUNC(timestamp, HOUR)
    ORDER BY city, timestamp
    """

    df = client.query(query).to_dataframe()

    # Pivot by city for multi-series forecasting
    pivot_df = df.pivot_table(
        index='timestamp',
        columns='city',
        values='pm25',
        aggfunc='first'
    ).reset_index()

    # Save to GCS
    pivot_df.to_csv(output_path, index=False)

    return output_path
```

### 6.2 AutoML Training Configuration

```python
# forecasting/train_automl.py
from google.cloud import aiplatform

def train_forecast_model(
    project_id: str,
    location: str,
    training_data_path: str,
    target_column: str = "pm25_Manila"
):
    aiplatform.init(project=project_id, location=location)

    # Create dataset
    dataset = aiplatform.TimeSeriesDataset.create(
        display_name="aircare-aqi-timeseries",
        gcs_source=training_data_path,
        bq_source=None
    )

    # Train AutoML model
    job = aiplatform.AutoMLForecastingTrainingJob(
        display_name="aircare-forecast-job",
        optimization_objective="minimize-rmse",
        column_transformations=[
            {"timestamp": {"column_name": "timestamp"}},
            {"numeric": {"column_name": target_column}}
        ]
    )

    model = job.run(
        dataset=dataset,
        target_column=target_column,
        time_column="timestamp",
        time_series_identifier_column="city",
        unavailable_at_forecast_columns=["pm25", "pm10", "no2"],
        forecast_horizon=72,  # 72 hours
        context_window=90 * 24,  # 90 days in hours
        budget_milli_node_hours=1000,
        model_display_name="aircare-aqi-forecaster-v1"
    )

    return model
```

---

## 7. Frontend Architecture

### 7.1 Streamlit App Structure

```
frontend/
├── app.py                  # Main Streamlit app
├── components/
│   ├── aqi_map.py         # Interactive map
│   ├── forecast_chart.py  # Chart component
│   ├── chat_interface.py  # Q&A chat
│   └── health_profile.py  # Profile selector
├── services/
│   ├── api_client.py      # Backend API client
│   └── rag_client.py      # RAG service client
├── utils/
│   ├── aqi_colors.py      # Color mapping
│   └── formatters.py      # Text formatting
├── requirements.txt
└── Dockerfile
```

### 7.2 Main App Code

```python
# app.py
import streamlit as st
from components import aqi_map, forecast_chart, chat_interface, health_profile
from services import api_client

st.set_page_config(
    page_title="AirCare SEA",
    page_icon="🌬️",
    layout="wide"
)

# Initialize session state
if 'health_profile' not in st.session_state:
    st.session_state.health_profile = 'healthy'
if 'selected_city' not in st.session_state:
    st.session_state.selected_city = None

# Header
st.title("🌬️ AirCare SEA")
st.caption("AI-Powered Air Quality & Health Companion for Southeast Asia")

# Sidebar: Health Profile
with st.sidebar:
    st.header("Your Health Profile")
    profile = health_profile.render()
    st.session_state.health_profile = profile

# City Search
col1, col2 = st.columns([3, 1])
with col1:
    city = st.text_input("Search city", placeholder="Manila, Jakarta, Bangkok...")
with col2:
    if st.button("Search", type="primary"):
        if city:
            st.session_state.selected_city = city

# Main Content
if st.session_state.selected_city:
    city_name = st.session_state.selected_city

    # Fetch AQI
    aqi_data = api_client.get_current_aqi(city_name)

    # Display AQI Card
    st.metric(
        label=f"Current AQI in {city_name}",
        value=aqi_data['aqi'],
        delta=aqi_data['category']
    )

    # Tabs
    tab1, tab2, tab3 = st.tabs(["📊 Forecast", "💬 Health Q&A", "📍 Map"])

    with tab1:
        forecast_data = api_client.get_forecast(city_name)
        forecast_chart.render(forecast_data)

    with tab2:
        chat_interface.render(
            city=city_name,
            current_aqi=aqi_data,
            health_profile=st.session_state.health_profile
        )

    with tab3:
        aqi_map.render([aqi_data])
else:
    st.info("👆 Search for a city to get started")
```

---

## 8. Deployment & Infrastructure

### 8.1 GCP Project Setup

```bash
# Set project
gcloud config set project aircare-sea

# Enable APIs
gcloud services enable \
  aiplatform.googleapis.com \
  bigquery.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com

# Create GCS bucket
gsutil mb -l us-central1 gs://aircare-sea-data

# Create BigQuery dataset
bq mk --location=us-central1 aircare_sea
```

### 8.2 Cloud Run Deployment

**Backend Dockerfile:**

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

# Set environment
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

# Run
CMD exec gunicorn --bind :$PORT --workers 2 --threads 4 --timeout 60 app:app
```

**Deploy Backend:**

```bash
cd backend
gcloud run deploy aircare-api \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 60s \
  --set-env-vars PROJECT_ID=aircare-sea,LOCATION=us-central1
```

**Deploy Frontend:**

```bash
cd frontend
gcloud run deploy aircare-app \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 0 \
  --max-instances 5 \
  --timeout 300s \
  --set-env-vars BACKEND_API_URL=https://aircare-api-[hash].run.app
```

### 8.3 Infrastructure as Code (Terraform)

```hcl
# terraform/main.tf
provider "google" {
  project = "aircare-sea"
  region  = "us-central1"
}

# GCS Bucket
resource "google_storage_bucket" "data" {
  name          = "aircare-sea-data"
  location      = "US-CENTRAL1"
  force_destroy = false

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 90
    }
  }
}

# BigQuery Dataset
resource "google_bigquery_dataset" "main" {
  dataset_id = "aircare_sea"
  location   = "US-CENTRAL1"
}

# BigQuery Table
resource "google_bigquery_table" "aqi_measurements" {
  dataset_id = google_bigquery_dataset.main.dataset_id
  table_id   = "aqi_measurements"

  time_partitioning {
    type  = "DAY"
    field = "timestamp"
  }

  clustering = ["city", "country"]

  schema = file("schemas/aqi_measurements.json")
}
```

---

## 9. Security & Authentication

### 9.1 API Key Management

```python
# utils/secrets.py
from google.cloud import secretmanager

def get_secret(secret_id: str, project_id: str) -> str:
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

# Usage
OPENAQ_API_KEY = get_secret("openaq-api-key", "aircare-sea")
```

### 9.2 Rate Limiting

```python
# middleware/rate_limiter.py
from functools import wraps
from flask import request, jsonify
import time
from collections import defaultdict

class RateLimiter:
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)

    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds

        # Clean old requests
        self.requests[client_id] = [
            req_time for req_time in self.requests[client_id]
            if req_time > window_start
        ]

        # Check limit
        if len(self.requests[client_id]) >= self.max_requests:
            return False

        self.requests[client_id].append(now)
        return True

rate_limiter = RateLimiter(max_requests=100, window_seconds=60)

def rate_limit(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client_id = request.remote_addr

        if not rate_limiter.is_allowed(client_id):
            return jsonify({
                "status": "error",
                "error": {
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": "Too many requests. Please try again later."
                }
            }), 429

        return f(*args, **kwargs)
    return decorated_function
```

---

## 10. Error Handling & Resilience

### 10.1 Retry Logic

```python
# utils/retry.py
import time
from functools import wraps
from typing import Callable

def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exceptions: tuple = (Exception,)
):
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            delay = base_delay

            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_retries - 1:
                        raise

                    time.sleep(min(delay, max_delay))
                    delay *= 2  # Exponential backoff

        return wrapper
    return decorator

# Usage
@retry_with_backoff(max_retries=3, exceptions=(requests.RequestException,))
def fetch_from_openaq(city: str):
    response = requests.get(f"https://api.openaq.org/v2/latest?city={city}")
    response.raise_for_status()
    return response.json()
```

### 10.2 Graceful Degradation

```python
# services/fallback_service.py
from typing import Optional
import logging

class AQIService:
    def __init__(self, openaq_client, cache_manager):
        self.openaq = openaq_client
        self.cache = cache_manager
        self.logger = logging.getLogger(__name__)

    def get_aqi(self, city: str) -> Optional[dict]:
        try:
            # Try live data first
            return self.openaq.get_current_aqi(city)
        except Exception as e:
            self.logger.warning(f"OpenAQ API failed: {e}. Falling back to cache.")

            # Fallback to cached data
            cached = self.cache.get(f"aqi_{city}")
            if cached:
                cached['is_stale'] = True
                cached['warning'] = "Showing cached data due to API unavailability"
                return cached

            # Ultimate fallback
            self.logger.error(f"No cached data available for {city}")
            return None
```

---

## 11. Monitoring & Logging

### 11.1 Structured Logging

```python
# utils/logger.py
import logging
import json
from datetime import datetime

class StructuredLogger:
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)

        # JSON formatter for Cloud Logging
        handler = logging.StreamHandler()
        handler.setFormatter(self._json_formatter())
        self.logger.addHandler(handler)

    def _json_formatter(self):
        class JSONFormatter(logging.Formatter):
            def format(self, record):
                log_obj = {
                    "timestamp": datetime.utcnow().isoformat(),
                    "severity": record.levelname,
                    "message": record.getMessage(),
                    "module": record.module,
                    "function": record.funcName,
                }

                if record.exc_info:
                    log_obj["exception"] = self.formatException(record.exc_info)

                return json.dumps(log_obj)

        return JSONFormatter()

    def info(self, message: str, **kwargs):
        extra_data = json.dumps(kwargs) if kwargs else ""
        self.logger.info(f"{message} {extra_data}")

    def error(self, message: str, **kwargs):
        extra_data = json.dumps(kwargs) if kwargs else ""
        self.logger.error(f"{message} {extra_data}")

# Usage
logger = StructuredLogger(__name__)
logger.info("AQI fetched successfully", city="Manila", aqi=158)
```

### 11.2 Cloud Monitoring Metrics

```python
# monitoring/metrics.py
from google.cloud import monitoring_v3
import time

class MetricsCollector:
    def __init__(self, project_id: str):
        self.client = monitoring_v3.MetricServiceClient()
        self.project_name = f"projects/{project_id}"

    def record_api_latency(self, endpoint: str, duration_ms: float):
        series = monitoring_v3.TimeSeries()
        series.metric.type = "custom.googleapis.com/aircare/api_latency"
        series.resource.type = "global"
        series.metric.labels["endpoint"] = endpoint

        now = time.time()
        seconds = int(now)
        nanos = int((now - seconds) * 10 ** 9)

        interval = monitoring_v3.TimeInterval(
            {"end_time": {"seconds": seconds, "nanos": nanos}}
        )

        point = monitoring_v3.Point({
            "interval": interval,
            "value": {"double_value": duration_ms}
        })

        series.points = [point]
        self.client.create_time_series(name=self.project_name, time_series=[series])
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

```python
# tests/test_aqi_calculator.py
import pytest
from utils.aqi_calculator import calculate_aqi

def test_aqi_good_range():
    assert calculate_aqi(pm25=10) == 41
    assert calculate_aqi(pm25=12) == 50

def test_aqi_moderate_range():
    assert calculate_aqi(pm25=20) == 67
    assert calculate_aqi(pm25=35.4) == 100

def test_aqi_unhealthy_range():
    assert calculate_aqi(pm25=40) == 111
    assert calculate_aqi(pm25=55.4) == 150

def test_aqi_hazardous():
    assert calculate_aqi(pm25=200) >= 300
```

### 12.2 Integration Tests

```python
# tests/test_rag_pipeline.py
import pytest
from services.rag_service import RAGService

@pytest.fixture
def rag_service():
    return RAGService(
        project_id="aircare-sea-test",
        location="us-central1",
        index_endpoint="test-endpoint"
    )

def test_rag_retrieval(rag_service):
    question = "What does AQI 150 mean?"
    context = {"city": "Manila", "current_aqi": 150}

    response = rag_service.ask(question, context)

    assert response['answer'] is not None
    assert len(response['sources']) > 0
    assert response['confidence_score'] > 0.7
```

### 12.3 End-to-End Tests

```python
# tests/test_e2e.py
import requests

def test_full_user_flow():
    base_url = "https://aircare-api-test.run.app"

    # Step 1: Get current AQI
    aqi_response = requests.get(f"{base_url}/api/v1/aqi/current?city=Manila")
    assert aqi_response.status_code == 200
    aqi_data = aqi_response.json()['data']

    # Step 2: Get forecast
    forecast_response = requests.get(f"{base_url}/api/v1/forecast/72h?city=Manila")
    assert forecast_response.status_code == 200

    # Step 3: Ask RAG question
    rag_response = requests.post(
        f"{base_url}/api/v1/rag/ask",
        json={
            "question": "Is it safe to jog outside?",
            "context": {"city": "Manila", "current_aqi": aqi_data['aqi']}
        }
    )
    assert rag_response.status_code == 200
    assert 'answer' in rag_response.json()['data']
```

---

## 13. Performance Requirements

### 13.1 Latency Targets

| **Endpoint**               | **Target** | **Max Acceptable** |
| -------------------------- | ---------- | ------------------ |
| GET /aqi/current           | < 500ms    | 2s                 |
| GET /forecast/72h          | < 2s       | 5s                 |
| POST /rag/ask              | < 3s       | 8s                 |
| Full page load (Streamlit) | < 4s       | 10s                |

### 13.2 Throughput Targets

| **Metric**                   | **Target** |
| ---------------------------- | ---------- |
| Concurrent users             | 50         |
| Requests/minute              | 500        |
| Vector Search queries/second | 10         |
| Gemini API calls/minute      | 60         |

### 13.3 Optimization Strategies

**Caching:**

```python
# Cache OpenAQ responses for 1 hour
# Cache forecast results for 3 hours
# Cache RAG embeddings permanently
```

**Batch Processing:**

```python
# Batch embed multiple chunks together
# Prefetch forecasts for top 5 cities daily
```

**Connection Pooling:**

```python
# Reuse HTTP connections to external APIs
# Maintain persistent gRPC connections to Vertex AI
```

---

## 14. Code Structure

### 14.1 Repository Layout

```
aircare-sea/
├── backend/
│   ├── app.py
│   ├── routes/
│   ├── services/
│   ├── models/
│   ├── utils/
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app.py
│   ├── components/
│   ├── services/
│   ├── utils/
│   ├── requirements.txt
│   └── Dockerfile
├── data-pipeline/
│   ├── ingestion/
│   │   └── openaq_fetcher.py
│   ├── preprocessing/
│   │   ├── chunker.py
│   │   └── embedder.py
│   └── forecasting/
│       ├── prepare_data.py
│       └── train_model.py
├── terraform/
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
├── docs/
│   ├── PRODUCT_DESIGN.md
│   ├── TECHNICAL_DESIGN.md (this file)
│   └── DEPLOYMENT.md
├── scripts/
│   ├── setup_gcp.sh
│   └── deploy.sh
├── .github/
│   └── workflows/
│       ├── test.yml
│       └── deploy.yml
└── README.md
```

### 14.2 Git Workflow

```bash
# Feature branches
main
├── feature/backend-api (Member 1)
├── feature/rag-pipeline (Member 2)
└── feature/frontend-ui (Member 2)

# Merge to main after each milestone
# Deploy from main branch only
```

---

## Appendices

### A. Environment Variables

```bash
# Backend
PROJECT_ID=aircare-sea
LOCATION=us-central1
GCS_BUCKET=aircare-sea-data
BIGQUERY_DATASET=aircare_sea
OPENAQ_API_KEY=<secret>
FORECAST_ENDPOINT=<vertex-ai-endpoint>

# Frontend
BACKEND_API_URL=https://aircare-api-xyz.run.app
ENABLE_DEBUG=false
```

### B. Useful Commands

```bash
# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=aircare-api" --limit 50

# Test endpoint
curl -X GET "https://aircare-api-xyz.run.app/api/v1/aqi/current?city=Manila"

# Deploy with new revision
gcloud run deploy aircare-api --source . --no-traffic
gcloud run services update-traffic aircare-api --to-revisions=LATEST=100
```

### C. References

- [Vertex AI AutoML Forecasting Docs](https://cloud.google.com/vertex-ai/docs/tabular-data/forecasting)
- [Vertex AI Vector Search Docs](https://cloud.google.com/vertex-ai/docs/vector-search/overview)
- [OpenAQ API Documentation](https://docs.openaq.org/)
- [WHO Air Quality Guidelines](https://www.who.int/publications/i/item/9789240034228)

---

**Document Version:** 1.0  
**Last Updated:** February 18, 2026  
**Status:** Ready for Implementation
