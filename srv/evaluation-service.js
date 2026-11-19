import cds from '@sap/cds'
import { overallScore, ratingFor, today } from './lib/scoring.js'

const { SELECT, UPDATE } = cds.ql
const LOG = cds.log('s4')

/**
 * Lieferantenbewertung als Side-by-Side-Erweiterung:
 *  - Lieferanten werden live aus SAP S/4HANA gelesen (API_BUSINESS_PARTNER)
 *  - Bewertungen werden lokal gespeichert
 *  - Beides wird im Service zusammengeführt ("Mashup")
 */
export default class EvaluationService extends cds.ApplicationService {
  async init() {
    const { Evaluations, Suppliers, SupplierScores } = this.entities
    const s4 = await cds.connect.to('API_BUSINESS_PARTNER')

    /** Liest Lieferanten aus S/4HANA, Ergebnis als Map ID -> Lieferant */
    const fetchSuppliers = async ids => {
      const unique = [...new Set(ids.filter(Boolean))]
      if (!unique.length) return new Map()
      const rows = await s4.run(SELECT.from(Suppliers).where({ ID: { in: unique } }))
      return new Map(rows.map(s => [s.ID, s]))
    }

    // ----------------------------------------------------------------
    // Lieferanten: Anfragen 1:1 an S/4HANA weiterreichen
    // ----------------------------------------------------------------
    this.on('READ', Suppliers, async req => {
      // OData V2 (S/4HANA) kennt kein $search -> in einen Filter auf Name oder Nummer übersetzen
      // (search kann vom Prototyp geerbt sein, daher überschreiben statt löschen)
      const query = req.query, { search, where } = query.SELECT
      query.SELECT.search = undefined
      const term = search?.map(t => t.val ?? '').join(' ').trim()
      if (term) {
        const cond = [{ func: 'contains', args: [{ ref: ['name'] }, { val: term }] }, 'or', { ref: ['ID'] }, '=', { val: term }]
        query.SELECT.where = where ? [{ xpr: where }, 'and', { xpr: cond }] : cond
      }
      try {
        return await s4.run(query)
      } catch (e) {
        LOG.error('S/4HANA nicht erreichbar:', e.message)
        return req.reject(502, 'S4_UNAVAILABLE')
      }
    })

    // ----------------------------------------------------------------
    // Bewertungen
    // ----------------------------------------------------------------
    this.before('NEW', Evaluations.drafts, req => {
      req.data.evaluationDate ??= today()
    })

    // Lieferant gewählt -> Namen aus S/4HANA übernehmen, Hinweis bei Einkaufssperre
    this.before('PATCH', Evaluations.drafts, async req => {
      if (!('supplier_ID' in req.data)) return
      const supplier = req.data.supplier_ID && (await fetchSuppliers([req.data.supplier_ID])).get(req.data.supplier_ID)
      req.data.supplierName = supplier?.name ?? null
      if (supplier?.purchasingBlocked) req.warn({ message: 'SUPPLIER_BLOCKED', target: 'supplier_ID', args: [supplier.ID] })
    })

    // Gesamtnote im Entwurf sofort neu berechnen
    this.after('PATCH', Evaluations.drafts, async (_, req) => {
      const ID = req.data.ID ?? req.params.at(-1)?.ID
      const draft = await SELECT.one.from(Evaluations.drafts, ID)
        .columns('quality', 'delivery', 'price', 'communication')
      if (!draft) return
      const score = overallScore(draft)
      await UPDATE(Evaluations.drafts, ID).with({ overallScore: score, rating_code: ratingFor(score) })
    })

    // Beim Speichern: Lieferant in S/4HANA prüfen, Name übernehmen, Note berechnen
    this.before(['CREATE', 'UPDATE'], Evaluations, async req => {
      const d = req.data
      if (d.supplier_ID) {
        let supplier
        try {
          supplier = (await fetchSuppliers([d.supplier_ID])).get(d.supplier_ID)
        } catch (e) {
          LOG.error('S/4HANA nicht erreichbar:', e.message)
          return req.reject(502, 'S4_UNAVAILABLE')
        }
        if (!supplier) return req.error({ status: 400, message: 'SUPPLIER_NOT_FOUND', target: 'supplier_ID', args: [d.supplier_ID] })
        d.supplierName = supplier.name
      }
      if (d.evaluationDate && d.evaluationDate > today()) {
        req.error({ status: 400, message: 'DATE_IN_FUTURE', target: 'evaluationDate' })
      }
      const score = overallScore(d)
      if (score != null) Object.assign(d, { overallScore: score, rating_code: ratingFor(score) })
    })

    // $expand=supplier: Daten kommen nicht aus der lokalen DB, sondern aus S/4HANA
    this.before('READ', Evaluations, req => {
      const columns = req.query.SELECT.columns
      const i = columns?.findIndex(c => c.ref?.[0] === 'supplier' && c.expand)
      if (i == null || i < 0) return
      req._expandSupplier = columns.splice(i, 1)[0]
      if (!columns.some(c => c === '*' || c.ref?.[0] === 'supplier_ID')) columns.push({ ref: ['supplier_ID'] })
    })
    this.after('READ', Evaluations, async (result, req) => {
      if (!req._expandSupplier) return
      const rows = Array.isArray(result) ? result : [result].filter(Boolean)
      const suppliers = await fetchSuppliers(rows.map(r => r.supplier_ID))
      for (const r of rows) r.supplier = suppliers.get(r.supplier_ID) ?? null
    })

    // ----------------------------------------------------------------
    // Auswertung je Lieferant: lokale Kennzahlen + Live-Status aus S/4HANA
    // ----------------------------------------------------------------
    this.after('READ', SupplierScores, async (result, req) => {
      const rows = Array.isArray(result) ? result : [result].filter(Boolean)
      if (!rows.length || rows[0].supplier === undefined) return
      let suppliers
      try {
        suppliers = await fetchSuppliers(rows.map(r => r.supplier))
      } catch (e) {
        LOG.error('S/4HANA nicht erreichbar:', e.message)
        req.warn('S4_UNAVAILABLE')     // Auswertung trotzdem liefern, nur ohne Live-Daten
        return
      }
      const text = key => cds.i18n.messages.at(key, req.locale) ?? key
      for (const r of rows) {
        const s = suppliers.get(r.supplier)
        Object.assign(r, {
          fullName: s?.fullName ?? null,
          industry: s?.industry ?? null,
          purchasingBlocked: s?.purchasingBlocked ?? null,
          s4Status: text(!s ? 'S4_STATUS_NOT_FOUND' : s.purchasingBlocked ? 'S4_STATUS_BLOCKED' : 'S4_STATUS_ACTIVE'),
          s4Criticality: !s || s.purchasingBlocked ? 1 : 3
        })
      }
    })

    return super.init()
  }
}
