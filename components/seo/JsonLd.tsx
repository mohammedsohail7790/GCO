import { serializeJsonLd } from '@/lib/seo/jsonld'

/** Server-rendered JSON-LD. No client JS; static with the page. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
