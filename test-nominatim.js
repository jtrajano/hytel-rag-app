const lat = 14.485720244579328
const lon = 121.0309474158141
const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&email=fernando.ordiales@hytel.io`

fetch(url, { headers: { 'Accept-Language': 'en' } })
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(err => console.error(err))
