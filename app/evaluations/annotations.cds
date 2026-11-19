using EvaluationService as service from '../../srv/evaluation-service';

// ------------------------------------------------------------------
// App "Lieferanten bewerten" (List Report + Object Page)
// ------------------------------------------------------------------

annotate service.Evaluations with @(
  UI.HeaderInfo              : {
    TypeName      : '{i18n>Evaluation}',
    TypeNamePlural: '{i18n>Evaluations}',
    Title         : { Value: supplierName },
    Description   : { Value: supplier_ID }
  },

  UI.SelectionFields         : [ supplier_ID, rating_code, evaluationDate, createdBy ],

  UI.LineItem                : [
    { Value: supplier_ID,    ![@UI.Importance]: #High },
    { Value: evaluationDate, ![@UI.Importance]: #High },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#Stars', Label: '{i18n>OverallScore}', ![@UI.Importance]: #High, ![@HTML5.CssDefaults]: { width: '9rem' } },
    { Value: rating_code, Criticality: rating.criticality, ![@UI.Importance]: #High },
    { Value: createdBy,      ![@UI.Importance]: #High }
  ],

  // Kompakte Tabelle für die Scorecard-App
  UI.LineItem #Scorecard     : [
    { Value: evaluationDate },
    { Value: quality },
    { Value: delivery },
    { Value: price },
    { Value: communication },
    { Value: overallScore },
    { Value: rating_code, Criticality: rating.criticality },
    { Value: createdBy },
    { Value: comment }
  ],

  UI.PresentationVariant     : {
    SortOrder     : [{ Property: evaluationDate, Descending: true }],
    Visualizations: ['@UI.LineItem']
  },

  UI.DataPoint #Stars        : { Value: overallScore, Visualization: #Rating, TargetValue: 5 },
  UI.DataPoint #Score        : { Value: overallScore, Title: '{i18n>OverallScore}' },
  UI.DataPoint #Rating       : { Value: rating_code, Title: '{i18n>Rating}', Criticality: rating.criticality },

  UI.HeaderFacets            : [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Score' },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Rating' }
  ],

  UI.Facets                  : [
    { $Type: 'UI.ReferenceFacet', ID: 'General',  Label: '{i18n>GeneralInformation}', Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'Criteria', Label: '{i18n>Criteria}',           Target: '@UI.FieldGroup#Criteria' },
    { $Type: 'UI.ReferenceFacet', ID: 'Admin',    Label: '{i18n>Administrative}',     Target: '@UI.FieldGroup#Admin' }
  ],
  UI.FieldGroup #General     : { Data: [
    { Value: supplier_ID },
    { Value: evaluationDate },
    { Value: comment }
  ]},
  UI.FieldGroup #Criteria    : { Data: [
    { Value: quality },
    { Value: delivery },
    { Value: price },
    { Value: communication },
    { Value: overallScore },
    { Value: rating_code, Criticality: rating.criticality }
  ]},
  UI.FieldGroup #Admin       : { Data: [
    { Value: createdBy },
    { Value: createdAt },
    { Value: modifiedAt }
  ]},

  // Lieferant gewählt -> Name aus S/4HANA nachladen
  Common.SideEffects #Supplier: {
    SourceProperties: [ supplier_ID ],
    TargetProperties: [ 'supplierName' ]
  },
  // Note geändert -> Gesamtnote und Klassifizierung neu berechnen
  Common.SideEffects #Score   : {
    SourceProperties: [ quality, delivery, price, communication ],
    TargetProperties: [ 'overallScore', 'rating_code' ],
    TargetEntities  : [ rating ]
  }
);
