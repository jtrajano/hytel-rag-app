import app from './app'
const port = Number(process.env.PORT ?? 5001)
app.listen(port, () => console.log(`API on http://localhost:${port}/trpc`))
