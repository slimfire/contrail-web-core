/*
 * Copyright (c) 2014 Juniper Networks, Inc. All rights reserved.
 */

define([
    'underscore',
    'backbone',
    'contrail-view-model',
    'knockout',
    'knockback',
    'validation'
], function (_, Backbone, ContrailViewModel, Knockout, Knockback) {
    _.extend(ContrailViewModel.prototype, Backbone.Validation.mixin)

    var ContrailModel = Knockback.ViewModel.extend({

        formatModelConfig: function(modelConfig) {
            return modelConfig;
        },

        constructor: function (modelData, modelRemoteDataConfig) {
            var self = this,
              model,
              errorAttributes,
              editingLockAttrs;

            self._modelAttributes = contrail.checkIfExist(modelData) ? modelData : self.defaultConfig;
            editingLockAttrs = generateAttributes(self._modelAttributes, cowc.LOCKED_SUFFIX_ID, true);

            if(contrail.checkIfExist(self.defaultConfig)) {
                modelData = cowu.filterJsonKeysWithNullValues(modelData);
            }
            modelData = $.extend(true, {}, self.defaultConfig, modelData);
            errorAttributes = generateAttributes(modelData, cowc.ERROR_SUFFIX_ID, false);
            modelData = $.extend(true, {}, modelData, {errors: new Backbone.Model(errorAttributes), locks: new Backbone.Model(editingLockAttrs)});

            modelData = self.formatModelConfig(modelData);
            model = new ContrailViewModel($.extend(true, {data: modelData}, modelRemoteDataConfig));
            model = _.extend(model, self.validations, {_originalAttributes: self._modelAttributes});

            Knockback.ViewModel.prototype.constructor.call(self, model);

            delete self.validations;
            return self;
        },

        getValueByPath: function (path) {
            var obj = this.model().attributes;
            path = path.replace(/\[(\w+)\]/g, '.$1');
            path = path.replace(/^\./, '');
            var pathArray = path.split('.');
            while (pathArray.length) {
                var property = pathArray.shift();
                if (obj != null && property in obj) {
                    obj = obj[property];
                } else {
                    return;
                }
            }
            return obj;
        },

        validateAttr: function (attributePath, validation) {
            var attr = cowu.getAttributeFromPath(attributePath),
                errors = this.model().get(cowc.KEY_MODEL_ERRORS),
                attrErrorObj = {}, isValid, model = this.model();

            isValid = model.isValid(attributePath, validation);
            attrErrorObj[attr + cowc.ERROR_SUFFIX_ID] = (isValid == true) ? false : isValid;
            errors.set(attrErrorObj);

            model.trigger("validated", isValid === "", model, attributePath);
            model.trigger("validated:" + (isValid === "" ? "valid" : "invalid"), model, attributePath);
        },

        isDeepValid: function(validations) {
            var isValid = true, validationOption = true,
                validationObj, key, keyObject, collectionModel, errors, attrErrorObj,
                objectType, getValidation, validationName, isInternalValid;

            for (var i = 0; i < validations.length; i++) {
                validationObj = validations[i];
                key = validationObj['key'];
                objectType = validationObj['type'];
                getValidation = validationObj['getValidation'];

                errors = this.model().get(cowc.KEY_MODEL_ERRORS);

                if(contrail.checkIfExist(key)) {
                    isInternalValid = true;

                    //handling the collection of collection validations
                    if(objectType === cowc.OBJECT_TYPE_COLLECTION_OF_COLLECTION) {
                        var primKey = key[0], secKey = key[1];
                        keyObject = this.model().attributes[primKey];
                        keyObject = keyObject instanceof Backbone.Collection ? keyObject.toJSON() : [];

                        for(var primColIndex = 0; primColIndex < keyObject.length; primColIndex++) {
                            var primColModel = keyObject[primColIndex];
                            var secKeyObject = primColModel.model().attributes[secKey];
                            if(secKeyObject) {
                                for(var secColIndex = 0; secColIndex < secKeyObject.size(); secColIndex++) {
                                    var secColModel = secKeyObject.at(secColIndex);
                                    validationName = getValidation instanceof Function ? getValidation(secColModel) : getValidation;
                                    isInternalValid = isInternalValid && secColModel.attributes.model().isValid(validationOption, validationName);
                                    isValid = isValid && isInternalValid;
                                }
                                setError4Key(errors, secKey, isInternalValid);
                            }
                        }
                    } else {
                        keyObject = this.model().attributes[key];

                        if(objectType == cowc.OBJECT_TYPE_COLLECTION) {
                            for( var j = 0; j < keyObject.size(); j++) {
                                collectionModel = keyObject.at(j);
                                validationName = typeof getValidation == 'function' ? getValidation(collectionModel) : getValidation;
                                isInternalValid = isInternalValid && collectionModel.attributes.model().isValid(validationOption, validationName);
                                isValid = isValid && isInternalValid;
                            }

                        } else if (objectType == cowc.OBJECT_TYPE_MODEL) {
                            validationName = typeof getValidation == 'function' ? getValidation(this) : getValidation;
                            isInternalValid = keyObject.model().isValid(validationOption, validationName);
                            isValid = isValid && isInternalValid;
                        }
                    }

                    setError4Key(errors, key, isInternalValid);
                } else {
                    validationName = typeof getValidation == 'function' ? getValidation(this) : getValidation;
                    isValid = isValid && this.model().isValid(validationOption, validationName);
                }
            }

            return isValid;
        },

        isAttrAvailable: function (name) {
            var self = this
            return !(!_.isFunction(self[name]) || self[name]() === null || self[name]() === '')
        },

        initLockAttr: function (attributePath, lockFlag) {
            var attribute = cowu.getAttributeFromPath(attributePath),
                locks = this.model().get(cowc.KEY_MODEL_LOCKS),
                errors = this.model().get(cowc.KEY_MODEL_ERRORS),
                lockObj = {}, attrErrorObj = {};

            lockObj[attribute + cowc.LOCKED_SUFFIX_ID] = lockFlag;
            locks.set(lockObj);

            attrErrorObj[attribute + cowc.ERROR_SUFFIX_ID] = false
            errors.set(attrErrorObj);
        },

        toggleLockAttr: function(attributePath) {
            var attribute = cowu.getAttributeFromPath(attributePath),
                locks = this.model().get(cowc.KEY_MODEL_LOCKS),
                lockedStatus = locks.attributes[attribute + cowc.LOCKED_SUFFIX_ID],
                lockObj = {};

            lockObj[attribute + cowc.LOCKED_SUFFIX_ID] = !lockedStatus;
            locks.set(lockObj);
        },

        showErrorAttr: function(attributePath, msg) {
            var attribute = cowu.getAttributeFromPath(attributePath),
                errors = this.model().get(cowc.KEY_MODEL_ERRORS),
                errorObj = {};

            errorObj[attribute + cowc.ERROR_SUFFIX_ID] = msg;
            errors.set(errorObj);
        },

        checkIfInputDisabled: function(disabledFlag, lockFlag) {
            return disabledFlag || lockFlag;
        },

        getFormErrorText: function (prefixId, inputErrText) {
            var modelErrors = this.model().attributes.errors.attributes,
                errorText = cowm.get(cowm.SHOULD_BE_VALID, cowl.get(prefixId));

            if(inputErrText === undefined){
                _.each(modelErrors, function (value, key) {
                    if (_.isFunction(modelErrors[key]) || (modelErrors[key] == 'false') || (modelErrors[key] == '')) {
                        delete modelErrors[key];
                    } else {
                        if (-1 == (key.indexOf('_form_error'))) {
                            var filterKey = key.split('_error')[0];
                            var key = filterKey.replace(/([a-z])([A-Z])/g, '$1 $2');
                            errorText = errorText + cowl.getFirstCharUpperCase(key) + ", ";
                        }
                    }
                });
            }else{
                errorText = errorText + inputErrText + ", ";
            }

            // Replace last comma by a dot
            errorText = errorText.slice(0, -2) + ".";
            return {responseText: errorText};
        },

        toJSON: function () {
            var self = this
            var json = {}
            _.each(self._modelAttributes, function (value, attr) {
                json[attr] = self[attr]()
            })
            return json
        },

        reset: function () {
            var self = this
            _.each(self._modelAttributes, function (value, attr) {
                clean(self[attr]);
            });
        },
    });

    function clean(koObservable) {
        var val = koObservable();
        if (_.isArray(val)) {
            koObservable([]);
        } else if (_.isString(val)) {
            koObservable("");
        } else if (_.isNumber(val)) {
            koObservable(Number.MIN_VALUE);
        } else if (_.isBoolean(val)) {
            koObservable(false);
        } else {
            koObservable(null);
        }
    }

    function setError4Key(errors, key, isInternalValid) {
        var attrErrorObj = {};
        if(!isInternalValid) {
            attrErrorObj[key + cowc.ERROR_SUFFIX_ID] = !isInternalValid;
            errors.set(attrErrorObj);
        }
    };

    function generateAttributes(attributes, suffix, defaultValue) {
        var flattenAttributes = cowu.flattenObject(attributes),
            errorAttributes = {};

        _.each(flattenAttributes, function (value, key) {
            var keyArray = key.split('.');
            errorAttributes[keyArray[keyArray.length - 1] + suffix] = defaultValue;
        });

        return errorAttributes;
    };

    return ContrailModel;
});
