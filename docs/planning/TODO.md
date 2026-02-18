This TODO list is structured based on the **11-Day Sprint Timeline** defined in your PDD, with specific technical implementation details pulled directly from your TDD.

I have separated tasks by **Shared**, **Member 1 (Data & Backend)**, and **Member 2 (RAG & Frontend)**.

### 📅 Phase 1: Setup & Data Ingestion (Days 1–2)

**Goal:** GCP environment ready, raw data flowing, and documents collected.

#### **Shared / Admin**

- [x] **GCP Project Setup:** Create project `aircare-sea`.
- [x] **Enable APIs:** Run TDD Section 8.1 commands (Vertex AI, BigQuery, Run, Storage, Secret Manager).
- [x] **GitHub Repo:** Initialize repo with structure from TDD Section 14.1.
- [x] **Secrets:** Store API Keys (OpenAQ, etc.) in GCP Secret Manager.

#### **Member 1 (Data & Forecast)**

- [x] **GCS Bucket:** Create `gs://aircare-sea-data` with folders `/raw`, `/processed`, `/models`.
- [x] **OpenAQ Client:** Write `openaq_client.py` (TDD 4.1) to fetch live data for target cities (Manila, Jakarta, Bangkok, etc.).
- [x] **Ingestion Script:** Create script to fetch _historical_ data (last 90 days) from OpenAQ and save as CSV/JSON to GCS.

```powershell
$env:CITIES=""  ## default to array of cities
$env:DAYS_BACK="" ## default to 90 days
node --env-file=.env.local scripts/ingest-openaq-historical.mjs

```

#### **Member 2 (RAG & App)**

- [ ] **Document Collection:** Download PDFs for WHO Guidelines (2021), DOH Advisories, and PubMed abstracts. **Partially done only**
- [x] **Text Extraction:** Write script (`pypdf` or `BeautifulSoup`) to convert PDFs/HTML to raw text files.
- [x] **Data Cleaning:** Remove headers, footers, and page numbers; save clean text to `gs://aircare-sea-data/docs/clean`.

Script: ` GCS_BUCKET=aircare-sea-data  pnpm fetch:docs`

---

### 📅 Phase 2: Pipelines & Storage (Days 3–4)

**Goal:** Database schemas created, forecasting data prepared, and vector index built.

#### **Member 1 (Data & Forecast)**

- [x] **BigQuery Setup:** Create dataset `aircare_sea` and table `aqi_measurements` using SQL from TDD Section 2.1.
- [x] **Data Loading:** Load the 90-day historical data from GCS into BigQuery.
- [x] **AutoML Prep:** Write `prepare_training_data.py` (TDD 6.1) to pivot BigQuery data into the CSV format required by Vertex AI (Timestamp, Target, Series ID).

Script: `LOCAL_DATA_DIR=tmp/openaq BQ_PROJECT=aircare-sea node scripts/load-to-bigquery.mjs`

Script: `BQ_PROJECT=aircare-sea python scripts/prepare_training_data.py`

#### **Member 2 (RAG & App)**

- [ ] **Chunking:** Implement `DocumentChunker` (TDD 5.2) with 512 token size / 100 overlap.
- [ ] **Embedding Generation:** Run batch job using `text-embedding-004` to create vectors from chunks.
- [ ] **Vector Search Index:** Create and deploy Vertex AI Vector Search Index.

---

### 📅 Phase 3: AI Models (Days 5–6)

**Goal:** Forecast model training and RAG pipeline operational.

#### **Member 1 (Data & Forecast)**

- [ ] **Train Model:** Submit Vertex AI AutoML Forecasting job (72h horizon).
- [ ] **Endpoint Deployment:** Deploy the trained model to a Vertex AI Endpoint.
- [ ] **Forecast Function:** Write Python wrapper to query the endpoint and format response as `ForecastPoint` objects.

#### **Member 2 (RAG & App)**

- [ ] **RAG Service:** Implement `RAGService` class (TDD 4.2) handling Embedding → Retrieval → Prompting.
- [ ] **Prompt Engineering:** Implement the System Prompt from PDD Section 8.3.
- [ ] **Validation:** Test 20 "Golden Questions" (e.g., "Safe for asthma?", "Can I jog?") and manually verify citations.

---

### 📅 Phase 4: App Build (Days 7–8)

**Goal:** Backend API running on Cloud Run, Frontend UI connected.

#### **Member 1 (Data & Forecast)**

- [ ] **API Skeleton:** Create FastAPI/Flask app structure (`backend/app.py`).
- [ ] **Endpoints:** Implement `GET /aqi/current` and `GET /forecast/72h` (TDD 3.1).
- [ ] **Caching:** Implement GCS or memory caching for OpenAQ responses (TDD 4.1).
- [ ] **Deploy Backend:** Dockerize and deploy API to Cloud Run.

#### **Member 2 (RAG & App)**

- [ ] **Streamlit Skeleton:** Create `frontend/app.py` with Sidebar (Profile) and Main Area (Tabs).
- [ ] **Map Component:** Implement `aqi_map.py` using `pydeck` or `folium`.
- [ ] **Chat Interface:** Build `chat_interface.py` to accept user input and display RAG responses.
- [ ] **Integration:** Connect Frontend `api_client` to Member 1's Backend URL.

---

### 📅 Phase 5: Polish & Integration (Days 9–10)

**Goal:** Fix bugs, handle edge cases, and improve UI UX.

#### **Member 1 (Data & Forecast)**

- [ ] **Error Handling:** Add retry logic (TDD 10.1) for OpenAQ API failures.
- [ ] **Fallback:** Ensure if Forecast fails, the app doesn't crash (return empty state or cached data).
- [ ] **Monitoring:** Verify Cloud Logging is capturing structured logs (TDD 11.1).

#### **Member 2 (RAG & App)**

- [ ] **Citation UI:** Ensure RAG responses neatly display sources (e.g., `[Source: WHO]` in green text).
- [ ] **Profile Logic:** Ensure "Asthmatic" profile actually changes the prompt sent to Gemini.
- [ ] **Daily Briefing:** Implement the "Daily Health Briefing" feature (MVP requirement).

---

### 📅 Phase 6: Demo Day (Day 11)

**Goal:** A crash-proof demo environment.

#### **Shared**

- [ ] **Final Deployment:** strictly `gcloud run deploy --no-traffic` first, then switch traffic.
- [ ] **Latency Check:** Ensure RAG answers take < 5 seconds (TDD 9.1).
- [ ] **Script Rehearsal:** Walk through the 3-minute script (PDD Section 11) three times.
- [ ] **Backup Video:** Record a screen capture of the "Happy Path" just in case live internet fails.
