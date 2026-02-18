// Firebase Functions entry point (stub)
// This file serves as the entry point for Firebase Cloud Functions
// In production, this would be deployed to Firebase

export { appRouter, type AppRouter } from './trpc/router'

// Stub: When deploying to Firebase, you would use:
// import * as functions from 'firebase-functions'
// import { createHTTPHandler } from '@trpc/server/adapters/standalone'
//
// export const api = functions.https.onRequest(
//   createHTTPHandler({ router: appRouter })
// )

console.log('Functions entry point loaded (stub mode)')
