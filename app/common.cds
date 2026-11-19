using EvaluationService as service from '../srv/evaluation-service';

// ------------------------------------------------------------------
// Gemeinsame Annotationen: Texte, Wertehilfen, Darstellung der Noten
// ------------------------------------------------------------------

annotate service.Suppliers with {
  ID                @Common: { Text: name, TextArrangement: #TextFirst };
  purchasingBlocked @UI.HiddenFilter;
};

annotate service.Evaluations with {
  ID       @UI.Hidden;
  supplier @Common: { Text: supplierName, TextArrangement: #TextFirst };
  rating   @Common: { Text: rating.name, TextArrangement: #TextOnly };
  createdBy @title: '{i18n>CreatedBy}';
};

annotate service.Ratings with {
  code @Common: { Text: name, TextArrangement: #TextOnly };
};

annotate service.SupplierScores with {
  supplier   @Common: { Text: supplierName, TextArrangement: #TextFirst };
  ratingCode @Common: {
    Text                    : rating.name,
    TextArrangement         : #TextOnly,
    ValueListWithFixedValues,
    ValueList               : {
      CollectionPath: 'Ratings',
      Parameters    : [
        { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: ratingCode, ValueListProperty: 'code' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
      ]
    }
  };
};
