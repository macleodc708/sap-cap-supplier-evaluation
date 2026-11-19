import cds from '@sap/cds'
import { overallScore, ratingFor } from '../srv/lib/scoring.js'

// S/4HANA wird in den Tests durch den eingebauten CAP-Mock ersetzt (--with-mocks)
const { GET, POST, PATCH, DELETE, expect } = cds.test('serve', 'all', '--with-mocks', '--in-memory').in(import.meta.dirname + '/..')

const API = '/odata/v4/evaluation'
const as = username => ({ auth: { username, password: 'demo' } })
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const draft = ID => `${API}/Evaluations(ID=${ID},IsActiveEntity=false)`
const active = ID => `${API}/Evaluations(ID=${ID},IsActiveEntity=true)`

/** Legt eine Bewertung als Entwurf an und aktiviert sie */
async function evaluate(user, data) {
  const { data: d } = await POST(`${API}/Evaluations`, {}, as(user))
  await PATCH(draft(d.ID), data, as(user))
  const { data: result } = await POST(`${draft(d.ID)}/EvaluationService.draftActivate`, {}, as(user))
  return result
}

describe('Bewertungslogik', () => {

  it('berechnet die gewichtete Gesamtnote', () => {
    expect(overallScore({ quality: 5, delivery: 4, price: 4, communication: 5 })).to.equal(4.5)
    expect(overallScore({ quality: 1, delivery: 1, price: 1, communication: 1 })).to.equal(1)
    expect(overallScore({ quality: 5, delivery: 4 })).to.equal(null)
  })

  it('klassifiziert nach A / B / C', () => {
    expect([ratingFor(4), ratingFor(3.99), ratingFor(3), ratingFor(2.99)]).to.eql(['A', 'B', 'B', 'C'])
  })
})

describe('Lieferanten aus S/4HANA', () => {

  it('liest Lieferanten über den Remote-Service', async () => {
    const { data } = await GET(`${API}/Suppliers?$orderby=ID`, as('anna'))
    expect(data.value.length).to.be.greaterThan(0)
    expect(data.value[0]).to.have.property('name')
  })

  it('unterstützt die Suche nach Name oder Nummer', async () => {
    const { data: byName } = await GET(`${API}/Suppliers?$search=Inc`, as('anna'))
    expect(byName.value.length).to.be.greaterThan(0)
    expect(byName.value.every(s => s.name.includes('Inc'))).to.be.true

    const { data: byId } = await GET(`${API}/Suppliers?$search=1000033`, as('anna'))
    expect(byId.value.map(s => s.ID)).to.eql(['1000033'])
  })
})

describe('Bewertung anlegen', () => {

  it('übernimmt den Namen aus S/4HANA und berechnet Note und Klassifizierung', async () => {
    const result = await evaluate('anna', {
      supplier_ID: '1000038', evaluationDate: daysAgo(1),
      quality: 4, delivery: 3, price: 5, communication: 4
    })
    expect(result).to.include({ supplierName: 'Harris Oldsmobile Inc', rating_code: 'B' })
    expect(Number(result.overallScore)).to.equal(3.9)
  })

  it('zeigt die Note schon im Entwurf an', async () => {
    const { data: d } = await POST(`${API}/Evaluations`, {}, as('anna'))
    await PATCH(draft(d.ID), { quality: 5, delivery: 5, price: 5, communication: 4 }, as('anna'))
    const { data } = await GET(draft(d.ID), as('anna'))
    expect(Number(data.overallScore)).to.equal(4.85)
    expect(data.rating_code).to.equal('A')
    expect(data.evaluationDate).to.equal(new Date().toISOString().slice(0, 10))   // Vorschlagswert: heute
  })

  it('warnt bei einem in S/4HANA gesperrten Lieferanten', async () => {
    const { data: d } = await POST(`${API}/Evaluations`, {}, as('anna'))
    const res = await PATCH(draft(d.ID), { supplier_ID: '1000039' }, as('anna'))
    expect(res.headers['sap-messages']).to.match(/blocked|gesperrt/)
  })

  it('lehnt Lieferanten ab, die es in S/4HANA nicht gibt', async () => {
    await expect(evaluate('anna', {
      supplier_ID: '99999999', evaluationDate: daysAgo(1), quality: 3, delivery: 3, price: 3, communication: 3
    })).to.be.rejectedWith(/does not exist|existiert/)
  })

  it('lehnt Noten außerhalb von 1 bis 5 ab', async () => {
    await expect(evaluate('anna', {
      supplier_ID: '1000033', evaluationDate: daysAgo(1), quality: 6, delivery: 3, price: 3, communication: 3
    })).to.be.rejected
  })

  it('lehnt ein Bewertungsdatum in der Zukunft ab', async () => {
    await expect(evaluate('anna', {
      supplier_ID: '1000033', evaluationDate: '2099-01-01', quality: 3, delivery: 3, price: 3, communication: 3
    })).to.be.rejectedWith(/future|Zukunft/)
  })

  it('liefert Lieferantendaten per $expand live aus S/4HANA', async () => {
    const { data } = await GET(`${API}/Evaluations?$filter=IsActiveEntity eq true and supplier_ID eq '1000039'&$expand=supplier`, as('anna'))
    expect(data.value[0].supplier).to.include({ ID: '1000039', purchasingBlocked: true })
  })
})

describe('Scorecard', () => {

  it('aggregiert die Bewertungen je Lieferant und ergänzt den S/4HANA-Status', async () => {
    const { data } = await GET(`${API}/SupplierScores('1000039')`, as('anna'))
    expect(data).to.include({ supplier: '1000039', evaluationCount: 1, ratingCode: 'C', purchasingBlocked: true })
    expect(data.s4Status).to.match(/blocked|Einkaufssperre/i)
  })
})

describe('Berechtigungen', () => {

  it('ohne Rolle "Purchaser" kein Zugriff', async () => {
    await expect(GET(`${API}/Evaluations`)).to.be.rejectedWith(/401|Unauthorized/)
  })

  it('fremde Bewertungen dürfen nicht geändert werden', async () => {
    const mine = await evaluate('anna', {
      supplier_ID: '1000040', evaluationDate: daysAgo(2), quality: 4, delivery: 4, price: 4, communication: 4
    })
    await expect(POST(`${active(mine.ID)}/EvaluationService.draftEdit`, {}, as('ben'))).to.be.rejectedWith(/403|Forbidden/)
    await expect(DELETE(active(mine.ID), as('ben'))).to.be.rejectedWith(/403|Forbidden/)
  })

  it('die Einkaufsleitung darf alle Bewertungen löschen', async () => {
    const mine = await evaluate('anna', {
      supplier_ID: '1000040', evaluationDate: daysAgo(3), quality: 2, delivery: 2, price: 2, communication: 2
    })
    const { status } = await DELETE(active(mine.ID), as('david'))
    expect(status).to.equal(204)
  })
})
