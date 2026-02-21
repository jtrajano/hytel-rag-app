import { onRequest } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'
import { defineSecret } from 'firebase-functions/params'
import app from './app.js'

setGlobalOptions({ region: 'asia-southeast1' })

const OPENAQ_API_KEY = defineSecret('OPENAQ_API_KEY')

export const api = onRequest({ cors: true, secrets: [OPENAQ_API_KEY] }, app)
