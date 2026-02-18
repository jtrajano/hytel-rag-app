# 🌬️ AirCare SEA

## AI-Powered Air Quality & Allergy Companion for Southeast Asia

**Product Design Document • v1.0 • 11-Day Sprint**

---

| **Team Size** | 2 Members                | **Timeline** | 11 Days   |
| ------------- | ------------------------ | ------------ | --------- |
| **Platform**  | Google Cloud / Vertex AI | **Status**   | In Design |

---

## 1. Executive Summary

### Product Vision

**AirCare SEA is an AI-powered air quality and allergy companion built specifically for Southeast Asia. It combines real-time pollution data, 72-hour AQI forecasting, and Gemini-powered health Q&A to help everyday people make safer decisions about outdoor activity, commuting, and family health.**

Across Southeast Asia, over 600 million people are exposed to dangerous levels of air pollution daily. Parents decide whether to send children to school, athletes plan outdoor workouts, and commuters step into smog — all without reliable, localized, plain-language guidance. AirCare SEA closes that gap.

Built on Google Cloud Platform and Vertex AI, the app demonstrates a production-grade RAG (Retrieval Augmented Generation) architecture grounded in WHO health guidelines and regional government advisories, combined with a live pollution forecasting pipeline — making it both technically rigorous and genuinely impactful.

---

## 2. Problem Statement

### 2.1 The Core Problem

Air pollution in Southeast Asia is a public health crisis hiding in plain sight. Despite being one of the most polluted regions in the world, the information available to ordinary people is:

- Fragmented across government portals, WHO bulletins, and health agency PDFs
- Written in technical language most people cannot interpret
- Generic — not localized to their city, neighborhood, or personal health condition
- Not actionable — numbers with no guidance on what to do

> **Key Statistic:** Air pollution causes 7 million deaths annually worldwide (WHO, 2024). Southeast Asia accounts for a disproportionate share. The Philippines, Indonesia, and Vietnam consistently rank among the most polluted nations in the Asia-Pacific region.

### 2.2 Who Is Affected

| **User Group**  | **Their Problem**                        | **What They Need**             |
| --------------- | ---------------------------------------- | ------------------------------ |
| Parents         | Is it safe to send kids to school today? | Simple YES/NO with reasoning   |
| Commuters       | Should I wear a mask today?              | AQI level + health guidance    |
| Asthma patients | Will today trigger my symptoms?          | Personalized risk alert        |
| Athletes        | Can I run outside this weekend?          | 72-hour forecast               |
| School admins   | Should we cancel outdoor PE?             | Authoritative decision support |

---

## 3. Solution Overview

### 3.1 What AirCare SEA Does

AirCare SEA answers one core question in many different forms: **Is the air safe for me today?** It does this through three integrated layers:

#### Layer 1 — Live Data

Real-time AQI fetched from OpenAQ API for major SEA cities. Displayed on an interactive map with color-coded risk zones.

#### Layer 2 — Forecast

Vertex AI AutoML Forecasting predicts AQI for the next 72 hours based on historical patterns, weather data, and seasonal burning activity.

#### Layer 3 — RAG Health Q&A (The Showpiece)

**Powered by Vertex AI Vector Search and Gemini 1.5 Flash**, the app retrieves relevant health guidance from WHO guidelines, Philippine DOH advisories, and PubMed respiratory research — then synthesizes a personalized, cited answer in plain language. **This is the core differentiator.**

### 3.2 Sample Interaction

```
User Profile:
Filipino, 32 years old, mild asthma, has a 6-year-old child

User Question:
"Should my family go to an outdoor fiesta in Pampanga this Saturday?"

AirCare SEA Response (Gemini + RAG):
"Saturday forecast for Pampanga: AQI 158 (Unhealthy). Based on WHO
guidelines, people with asthma and young children are considered sensitive
groups and should avoid prolonged outdoor exposure above AQI 150. If you
must attend, take antihistamines beforehand, bring your reliever inhaler,
and limit your child's time in open areas. Consider leaving before midday
when pollution concentrates. [Source: WHO Air Quality Guidelines 2021,
DOH Advisory PH-2023-08]"
```

---

## 4. Features

### 4.1 Must-Have Features (MVP — Days 1–8)

| **Feature**           | **Description**                                                                                              | **Owner** |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| Live AQI Map          | Real-time air quality for SEA cities from OpenAQ API. Color-coded risk zones.                                | Member 1  |
| 72-Hour AQI Forecast  | Vertex AI AutoML predicts air quality using 90-day historical data and weather patterns.                     | Member 1  |
| RAG Health Q&A        | Gemini 1.5 Flash answers natural language health questions grounded in retrieved documents.                  | Member 2  |
| Health Profile        | User selects their sensitivity: healthy adult, asthma, pregnant, elderly, child. Personalizes all responses. | Member 2  |
| City Search           | User types any SEA city and instantly sees AQI + personalized health guidance.                               | Member 2  |
| Daily Health Briefing | One-paragraph AI-generated morning summary for the user's city.                                              | Member 2  |

### 4.2 Version 2 Features (Post-Sprint)

| **Feature**                       | **Why Deferred**                                                      |
| --------------------------------- | --------------------------------------------------------------------- |
| Full Pollen Forecast Model        | Requires a second Vertex AI training pipeline — too heavy for 11 days |
| Multilingual Support (FIL, ID)    | Adds UI complexity and testing overhead — valuable but not for MVP    |
| School Safety Mode                | Requires additional UX design and role-based flows — Version 2        |
| Burning/Haze Tracker (NASA FIRMS) | Interesting but not core to the RAG + Forecast demo                   |
| Historical Trend Analysis         | BigQuery queries work but adds dashboard complexity — deferred        |

---

## 5. Technical Architecture

### 5.1 System Overview

**Architecture Summary:** AirCare SEA is a two-layer AI application on GCP. The Data & Forecast Layer (Member 1) handles real-time ingestion and time-series prediction. The RAG & Application Layer (Member 2) handles document retrieval, LLM synthesis, and the user-facing interface. Both layers share a GCS bucket as the central data store.

### 5.2 GCP Service Mapping

| **Component**    | **GCP Service**              | **Purpose**                                  |
| ---------------- | ---------------------------- | -------------------------------------------- |
| Raw Data Storage | Cloud Storage (GCS)          | Stores OpenAQ data + health PDFs             |
| Time Series Data | BigQuery                     | Historical AQI by city and date              |
| AQI Forecasting  | Vertex AI AutoML Forecasting | 72-hour AQI prediction model                 |
| Text Embeddings  | Vertex AI text-embedding-004 | Embeds health documents for retrieval        |
| Vector Store     | Vertex AI Vector Search      | Indexes and retrieves relevant health chunks |
| LLM Synthesis    | Gemini 1.5 Flash             | Generates grounded health Q&A answers        |
| App Hosting      | Cloud Run                    | Hosts Streamlit app, scales to zero          |
| Secrets          | Secret Manager               | Stores API keys and credentials              |

### 5.3 Data Sources

| **Source**                 | **What It Provides**                                      | **Format** | **Cost** |
| -------------------------- | --------------------------------------------------------- | ---------- | -------- |
| OpenAQ API                 | Real-time AQI for all major SEA cities — PM2.5, PM10, NO2 | JSON API   | Free     |
| WHO Air Quality Guidelines | Health thresholds and recommendations by pollutant level  | PDF        | Free     |
| Philippine DOH Advisories  | Local health advisories and pollution warnings            | PDF/HTML   | Free     |
| PubMed Abstracts           | Respiratory research: asthma, PM2.5 health effects        | API        | Free     |
| Open-Meteo API             | Weather data for forecast context (wind, humidity)        | JSON API   | Free     |
| DENR Philippines           | Local environmental quality standards                     | PDF        | Free     |

---

## 6. Team Structure & Responsibilities

### Member 1 — Data & Forecast Engineer

**Owns the data ingestion and prediction layer.**

- GCP project setup, IAM, billing
- OpenAQ API integration and ingestion to GCS
- BigQuery time series schema and loading
- Vertex AI AutoML Forecasting training
- Forecast endpoint deployment and API
- Backend Cloud Run API for AQI data

### Member 2 — RAG & Application Engineer

**Owns the retrieval, LLM, and user interface.**

- Health document collection and chunking
- Vertex AI text-embedding-004 pipeline
- Vector Search indexing and retrieval testing
- Gemini 1.5 Flash RAG pipeline and prompting
- Streamlit frontend UI design and build
- Demo prep, presentation story, video backup

### Shared Responsibilities

- GCP project setup (Day 1 together)
- Agree on data schema and city list
- Integration point: forecast endpoint → RAG prompt
- End-to-end testing (Days 9–10)
- Final demo rehearsal (Day 11)

---

## 7. 11-Day Sprint Timeline

| **Days** | **Phase**    | **Member 1 Deliverables**                      | **Member 2 Deliverables**                                           |
| -------- | ------------ | ---------------------------------------------- | ------------------------------------------------------------------- |
| 1–2      | Setup & Data | GCP setup, OpenAQ API working, raw data in GCS | Collect & clean 30+ health PDFs, GCS upload                         |
| 3–4      | Pipelines    | BigQuery schema, historical AQI data loaded    | Chunk docs, embed with text-embedding-004, index into Vector Search |
| 5–6      | AI Models    | AutoML Forecasting trained, endpoint deployed  | Gemini RAG pipeline working, 20 test Q&As validated                 |
| 7–8      | App Build    | Backend API on Cloud Run for AQI + forecast    | Streamlit UI: city search, AQI display, health profile, Q&A chat    |
| 9–10     | Polish       | Forecast accuracy report, fix data edge cases  | Daily briefing feature, prompt refinement, bug fixes                |
| 11       | Demo         | Deploy final version, backup video recording   | Presentation story, 3-minute demo script rehearsed                  |

---

## 8. RAG System Design

### 8.1 Document Corpus

The RAG system is grounded in three categories of authoritative health documents:

- WHO Air Quality Guidelines (2021) — primary health thresholds and risk definitions
- Philippine DOH and DENR advisories — localized regulatory guidance
- PubMed abstracts — evidence base for respiratory conditions (asthma, COPD, allergic rhinitis)
- OWWA/POEA health advisories for OFWs in polluted countries

### 8.2 Chunking Strategy

| **Parameter**        | **Value & Rationale**                                           |
| -------------------- | --------------------------------------------------------------- |
| Chunk size           | 512 tokens — balances context richness with retrieval precision |
| Chunk overlap        | 100 tokens — prevents losing context at chunk boundaries        |
| Metadata per chunk   | Source, document title, section, date, pollutant tags           |
| Top-K retrieval      | 5 most relevant chunks per query                                |
| Similarity threshold | 0.75 minimum — filters out weakly relevant results              |

### 8.3 Gemini Prompt Structure

```
System Prompt Template
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are AirCare SEA, a health assistant for Southeast Asian users.

Current AQI in {city}: {aqi_value} — {aqi_category}
72-Hour Forecast: {forecast_summary}
User Health Profile: {profile}
Retrieved Health Context: {top_5_chunks}

Answer in plain language. Cite your sources. End with a clear action
recommendation.
```

---

## 9. Success Metrics

### 9.1 Technical Metrics

| **Metric**               | **Target**                  | **Measurement**             |
| ------------------------ | --------------------------- | --------------------------- |
| RAG retrieval relevance  | > 0.80 similarity score avg | Vector Search metrics       |
| Forecast accuracy (RMSE) | < 15 AQI units              | Vertex AI evaluation        |
| RAG response time        | < 5 seconds end-to-end      | Cloud Run latency logs      |
| App uptime during demo   | 100%                        | Cloud Run monitoring        |
| Q&A factual grounding    | 100% answers cite a source  | Manual review of 30 test Qs |

### 9.2 Demo Success Criteria

- The app answers a live, unrehearsed question about a real SEA city correctly
- The response cites a WHO or DOH source — not a hallucination
- The forecast shows a meaningful 72-hour trend for at least 3 cities
- The health profile changes the recommendation — proving personalization works
- The app is publicly accessible via a Cloud Run URL

---

## 10. Risks & Mitigations

| **Risk**                                   | **Severity** | **Mitigation**                                                                          |
| ------------------------------------------ | ------------ | --------------------------------------------------------------------------------------- |
| AutoML Forecasting takes > 3 days to train | High         | Start training on Day 3. If it fails, fall back to a simple ARIMA model in BigQuery ML. |
| OpenAQ has no data for smaller SEA cities  | Medium       | Focus on major cities: Manila, Jakarta, Bangkok, HCMC, KL. All well-covered.            |
| Gemini hallucination in health Q&A         | High         | Strict prompt: 'Only use the provided context. If unsure, say so.' Always cite source.  |
| Vector Search indexing errors              | Medium       | Test retrieval with 20 sample queries before building the UI. Fix corpus quality early. |
| Scope creep (adding features)              | High         | Feature freeze after Day 6. No new features in last 5 days — only polish and fix.       |
| GCP billing overrun                        | Medium       | Set budget alert at $50. Use Gemini Flash not Pro. Scale Cloud Run to zero when idle.   |

---

## 11. Demo Script (3 Minutes)

| **Time**  | **Action**                   | **What You Say**                                                                                                                                                                                      |
| --------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:30 | Open the app                 | "We built AirCare SEA because 600 million people in Southeast Asia make daily health decisions with almost no reliable, localized guidance. Today we're changing that."                               |
| 0:30–1:00 | Show live AQI map            | "This is real-time air quality across Southeast Asia right now, pulled from OpenAQ. You can see Manila is at AQI 158 — Unhealthy. Let's find out what that means for a real person."                  |
| 1:00–1:40 | Set health profile + ask Q&A | "I set my profile as a parent with mild asthma and a young child. I type: Should my family go to an outdoor event in Manila this weekend? Watch what happens."                                        |
| 1:40–2:10 | Show RAG response            | "Gemini retrieves 5 chunks from WHO and DOH advisories, combines it with our 72-hour forecast, and gives a personalized, cited answer in plain language. Not a guess — grounded in real health data." |
| 2:10–2:40 | Show 72-hour forecast        | "And this is our Vertex AI AutoML forecast — 72 hours ahead, with confidence intervals. So you can plan ahead, not just react."                                                                       |
| 2:40–3:00 | Close                        | "AirCare SEA. Built by two people, in 11 days, for the millions of Southeast Asians who deserve better than a number they don't understand."                                                          |

---

## Final Note

> **This document covers Version 1 — the 11-day MVP. The goal is not to build everything. The goal is to make one demo moment absolutely unforgettable. Focus on the RAG Q&A response quality above all else. That is what people will remember.**

---

_AirCare SEA Product Design Document v1.0 — Confidential_
