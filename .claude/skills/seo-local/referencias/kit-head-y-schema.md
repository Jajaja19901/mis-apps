# Kit de `<head>` + schema.org (listo para pegar)

Rellena los `PLACEHOLDER` con datos del **briefing**. **NAP idéntico** en todos lados (mejor: en `CONFIG`).
**Nunca** inventes valoraciones ni datos.

---

## 1) Bloque `<head>` completo
```html
<!DOCTYPE html>
<html lang="es">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NEGOCIO · SERVICIO_PRINCIPAL en CIUDAD</title>
<meta name="description" content="Texto real de 140–160 caracteres con beneficio + llamada a la acción. Ej.: Peluquería en CIUDAD. Corte, color y peinado. Pide cita por WhatsApp en 1 minuto.">
<link rel="canonical" href="https://DOMINIO/">
<meta name="robots" content="index,follow">
<meta name="theme-color" content="#BRAND_HEX">

<!-- Open Graph (compartir en WhatsApp/Facebook) -->
<meta property="og:type" content="website">
<meta property="og:title" content="NEGOCIO · SERVICIO_PRINCIPAL en CIUDAD">
<meta property="og:description" content="Mismo gancho que la description.">
<meta property="og:url" content="https://DOMINIO/">
<meta property="og:image" content="https://DOMINIO/og.jpg">
<meta property="og:locale" content="es_ES">

<!-- Twitter/X -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="NEGOCIO · SERVICIO_PRINCIPAL en CIUDAD">
<meta name="twitter:description" content="Mismo gancho.">
<meta name="twitter:image" content="https://DOMINIO/og.jpg">
```
> En `file://` o sin dominio aún, deja `og:url`/`canonical` con un placeholder y avísalo.

## 2) `@type` por sector (usa el más específico que exista)
| Sector | `@type` |
|---|---|
| Genérico | `LocalBusiness` |
| Peluquería | `HairSalon` |
| Estética/belleza | `BeautySalon` |
| Restaurante / bar | `Restaurant` / `BarOrPub` |
| Cafetería | `CafeOrCoffeeShop` |
| Panadería | `Bakery` |
| Dentista | `Dentist` |
| Fisioterapia | `Physiotherapy` |
| Médico/clínica | `MedicalClinic` |
| Gimnasio | `HealthClub` / `ExerciseGym` |
| Abogado | `Attorney` / `LegalService` |
| Inmobiliaria | `RealEstateAgent` |
| Taller mecánico | `AutoRepair` |
| Tienda | `Store` |

## 3) JSON-LD `LocalBusiness` (plantilla base)
Va antes de `</head>` (o al final del `<body>`). Quita los campos que no apliquen.
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "NEGOCIO",
  "image": "https://DOMINIO/og.jpg",
  "url": "https://DOMINIO/",
  "telephone": "+34TELEFONO",
  "priceRange": "€€",
  "description": "Descripción real del negocio en CIUDAD.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "CALLE Y NÚMERO",
    "addressLocality": "CIUDAD",
    "postalCode": "CP",
    "addressCountry": "ES"
  },
  "geo": { "@type": "GeoCoordinates", "latitude": LAT, "longitude": LNG },
  "areaServed": "CIUDAD",
  "openingHoursSpecification": [
    { "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "09:00", "closes": "20:00" }
  ],
  "sameAs": ["https://instagram.com/PERFIL", "https://facebook.com/PERFIL"]
}
</script>
```
> **`aggregateRating`/`review`: solo si son REALES** (del briefing). Inventarlos infringe la política de
> Google y la regla de oro. Si los hay y son reales, añade:
> `"aggregateRating": {"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"NN"}`

## 4) Variantes rápidas
- **Restaurant:** añade `"servesCuisine":"española"`, `"acceptsReservations":"true"`, `"menu":"https://DOMINIO/#carta"`.
- **HairSalon / BeautySalon:** `"hasOfferCatalog"` con servicios (opcional).
- Mantén el resto de campos de la base.

## 5) `FAQPage` (si hay FAQ REAL en la página)
```html
<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"FAQPage",
  "mainEntity":[
    {"@type":"Question","name":"PREGUNTA REAL",
     "acceptedAnswer":{"@type":"Answer","text":"RESPUESTA REAL"}}
  ]
}
</script>
```

## 6) Si se publica en un dominio (opcional)
`robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://DOMINIO/sitemap.xml
```
`sitemap.xml` (una sola URL):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://DOMINIO/</loc></url>
</urlset>
```

---

### Validación (no te saltes esto)
- Pega el JSON-LD en el **Rich Results Test** y el **Schema Markup Validator** de Google → 0 errores.
- Comprueba que **NAP** (nombre/dirección/teléfono) es **idéntico** en head, schema, pie y Google Business.
- Title ≤60, description 140–160. Un solo `<h1>`. Imágenes con `alt` y `loading="lazy"`.
