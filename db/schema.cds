namespace sap.portfolio.se;

using {
  cuid,
  managed,
  sap.common.CodeList
} from '@sap/cds/common';

using { API_BUSINESS_PARTNER as S4 } from '../srv/external/API_BUSINESS_PARTNER';

// ------------------------------------------------------------------
// Lieferanten: kommen live aus SAP S/4HANA (API_BUSINESS_PARTNER)
// und werden hier NICHT gespeichert.
// ------------------------------------------------------------------
@cds.persistence.skip
entity Suppliers as projection on S4.A_Supplier {
  @title: '{i18n>Supplier}'          key Supplier             as ID,
  @title: '{i18n>SupplierName}'      SupplierName             as name,
  @title: '{i18n>FullName}'          SupplierFullName         as fullName,
  @title: '{i18n>Industry}'          Industry                 as industry,
  @title: '{i18n>AccountGroup}'      SupplierAccountGroup     as accountGroup,
  @title: '{i18n>PurchasingBlocked}' PurchasingIsBlocked      as purchasingBlocked,
  @title: '{i18n>CreatedOn}'         CreationDate             as createdOn
};

// ------------------------------------------------------------------
// Lieferantenbewertung: eigene Daten der Erweiterung (Side-by-Side)
// ------------------------------------------------------------------
entity Evaluations : cuid, managed {
  supplier       : Association to Suppliers @title: '{i18n>Supplier}'      @mandatory;
  supplierName   : String(80)    @title: '{i18n>SupplierName}'  @readonly;   // Kopie aus S/4HANA zum Zeitpunkt der Bewertung
  evaluationDate : Date          @title: '{i18n>EvaluationDate}' @mandatory;
  quality        : Integer       @title: '{i18n>Quality}'       @mandatory  @assert.range: [1, 5];
  delivery       : Integer       @title: '{i18n>Delivery}'      @mandatory  @assert.range: [1, 5];
  price          : Integer       @title: '{i18n>Price}'         @mandatory  @assert.range: [1, 5];
  communication  : Integer       @title: '{i18n>Communication}' @mandatory  @assert.range: [1, 5];
  overallScore   : Decimal(3, 2) @title: '{i18n>OverallScore}'  @readonly;
  rating         : Association to Ratings @title: '{i18n>Rating}' @readonly;
  comment        : String(1000)  @title: '{i18n>Comment}'       @UI.MultiLineText;
}

/**
 * ABC-Klassifizierung von Lieferanten
 *   A = Bevorzugt (ab 4,0)  ·  B = Akzeptabel (ab 3,0)  ·  C = Kritisch (unter 3,0)
 */
entity Ratings : CodeList {
  key code        : String(1) enum { A; B; C };
      minScore    : Decimal(3, 2);
      criticality : Integer;
}

// ------------------------------------------------------------------
// Auswertung je Lieferant (lokal aggregiert, angereichert mit S/4-Daten)
// ------------------------------------------------------------------
entity SupplierScores as
  select from Evaluations {
    @title: '{i18n>Supplier}'        key supplier.ID                           as supplier         : String(10),
    @title: '{i18n>SupplierName}'    max(supplierName)                         as supplierName     : String(80),
    @title: '{i18n>EvaluationCount}' count(*)                                  as evaluationCount  : Integer,
    @title: '{i18n>AverageScore}'    cast(avg(overallScore) as Decimal(3, 2))  as averageScore     : Decimal(3, 2),
    @title: '{i18n>Quality}'         cast(avg(quality) as Decimal(3, 2))       as avgQuality       : Decimal(3, 2),
    @title: '{i18n>Delivery}'        cast(avg(delivery) as Decimal(3, 2))      as avgDelivery      : Decimal(3, 2),
    @title: '{i18n>Price}'           cast(avg(price) as Decimal(3, 2))         as avgPrice         : Decimal(3, 2),
    @title: '{i18n>Communication}'   cast(avg(communication) as Decimal(3, 2)) as avgCommunication : Decimal(3, 2),
    @title: '{i18n>LastEvaluation}'  max(evaluationDate)                       as lastEvaluation   : Date,
    @title: '{i18n>Rating}'          case
                                       when avg(overallScore) >= 4 then 'A'
                                       when avg(overallScore) >= 3 then 'B'
                                       else 'C'
                                     end                                       as ratingCode       : String(1)
  }
  group by supplier.ID;
