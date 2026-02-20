import { onRequest } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'
import app from './app.js'

setGlobalOptions({ region: 'asia-southeast1' })
export const api = onRequest({ cors: true }, app)
