using { sap.portfolio.se as db } from '../db/schema';

/**
 * Lieferantenbewertung als Side-by-Side-Erweiterung zu SAP S/4HANA:
 * Lieferanten-Stammdaten werden live aus S/4HANA gelesen,
 * die Bewertungen liegen in der eigenen Datenbank der Erweiterung.
 */
@path    : 'evaluation'
@requires: 'Purchaser'
service EvaluationService {

  @odata.draft.enabled
  @restrict: [
    { grant: ['READ', 'CREATE'], to: 'Purchaser' },
    { grant: ['UPDATE', 'DELETE'], to: 'Purchaser', where: 'createdBy = $user' },
    { grant: '*', to: 'PurchasingManager' }
  ]
  entity Evaluations    as projection on db.Evaluations;

  /** Remote: Lieferanten aus SAP S/4HANA (nur lesend, dient auch als Wertehilfe) */
  @readonly
  @cds.odata.valuelist
  entity Suppliers      as projection on db.Suppliers;

  /** Auswertung je Lieferant, angereichert mit Live-Daten aus S/4HANA */
  @readonly
  entity SupplierScores as projection on db.SupplierScores {
    *,
    rating      : Association to db.Ratings on rating.code = ratingCode,
    evaluations : Association to many Evaluations on evaluations.supplier.ID = supplier,
    @title: '{i18n>FullName}'          virtual fullName          : String(80),
    @title: '{i18n>Industry}'          virtual industry          : String(10),
    @title: '{i18n>PurchasingBlocked}' virtual purchasingBlocked : Boolean,
    @title: '{i18n>S4Status}'          virtual s4Status          : String(20),
                                       virtual s4Criticality     : Integer
  };

  @readonly entity Ratings as projection on db.Ratings;
}
