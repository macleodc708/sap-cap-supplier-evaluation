using EvaluationService as service from '../../srv/evaluation-service';

// ------------------------------------------------------------------
// App "Lieferanten-Scorecard": Auswertung je Lieferant
// (lokale Kennzahlen + Live-Status aus SAP S/4HANA)
// ------------------------------------------------------------------

annotate service.SupplierScores with @(
  UI.HeaderInfo          : {
    TypeName      : '{i18n>Supplier}',
    TypeNamePlural: '{i18n>Suppliers}',
    Title         : { Value: supplierName },
    Description   : { Value: supplier }
  },

  UI.SelectionFields     : [ supplier, ratingCode, lastEvaluation ],

  UI.LineItem            : [
    { Value: supplier,        ![@UI.Importance]: #High },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#Stars', Label: '{i18n>AverageScore}', ![@UI.Importance]: #High, ![@HTML5.CssDefaults]: { width: '9rem' } },
    { Value: ratingCode, Criticality: rating.criticality, ![@UI.Importance]: #High },
    { Value: evaluationCount, ![@UI.Importance]: #High },
    { Value: lastEvaluation,  ![@UI.Importance]: #High },
    { Value: s4Status, Criticality: s4Criticality, ![@UI.Importance]: #High }
  ],

  UI.PresentationVariant : {
    SortOrder     : [{ Property: averageScore, Descending: true }],
    Visualizations: ['@UI.LineItem']
  },

  UI.DataPoint #Stars    : { Value: averageScore, Visualization: #Rating, TargetValue: 5 },
  UI.DataPoint #Average  : { Value: averageScore, Title: '{i18n>AverageScore}' },
  UI.DataPoint #Rating   : { Value: ratingCode, Title: '{i18n>Rating}', Criticality: rating.criticality },
  UI.DataPoint #S4Status : { Value: s4Status, Title: '{i18n>S4Status}', Criticality: s4Criticality },

  UI.HeaderFacets        : [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Average' },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Rating' },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#S4Status' }
  ],

  UI.Facets              : [
    { $Type: 'UI.ReferenceFacet', ID: 'Scores',      Label: '{i18n>Scores}',         Target: '@UI.FieldGroup#Scores' },
    { $Type: 'UI.ReferenceFacet', ID: 'S4',          Label: '{i18n>SupplierFromS4}', Target: '@UI.FieldGroup#S4' },
    { $Type: 'UI.ReferenceFacet', ID: 'Evaluations', Label: '{i18n>Evaluations}',    Target: 'evaluations/@UI.LineItem#Scorecard' }
  ],
  UI.FieldGroup #Scores  : { Data: [
    { Value: avgQuality },
    { Value: avgDelivery },
    { Value: avgPrice },
    { Value: avgCommunication },
    { Value: evaluationCount },
    { Value: lastEvaluation }
  ]},
  UI.FieldGroup #S4      : { Data: [
    { Value: fullName },
    { Value: industry },
    { Value: purchasingBlocked },
    { Value: s4Status, Criticality: s4Criticality }
  ]}
);
