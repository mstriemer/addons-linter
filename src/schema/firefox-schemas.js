import manifestNamespaces from './firefox-manifest.json';
import extensionTypesNamespaces from './firefox-extension-types.json';

function loadTypes(schema) {
  // Convert the array of types to an object.
  return schema.types.reduce((obj, type) => ({
    ...obj,
    [type.id]: type,
  }), {});
}

function expandValue(namespaces, currentNamespace, schema, name, value) {
  if (typeof value !== 'object') {
    return value;
  }
  if ('$ref' in value) {
    let lookupId = value['$ref'];
    let namespace = currentNamespace;
    if (lookupId.includes('.')) {
      [ namespace, lookupId ] = lookupId.split('.');
    }
    const lookupNamespace = namespaces[namespace].types;
    const { $ref, ...newValue } = value;
    const { id, ...ref } = lookupNamespace[lookupId];
    return expandValue(namespaces, currentNamespace, schema, name, { ...ref, ...newValue });
  }
  const { ...newValue } = value;
  if ('types' in value) {
    newValue.types = expandValues(namespaces, currentNamespace, schema, value.types);
  }
  if ('properties' in value) {
    newValue.properties = expandValues(namespaces, currentNamespace, schema, value.properties);
  }
  if ('additionalProperties' in value && typeof value.additionalProperties === 'object') {
    newValue.additionalProperties = expandValues(
      namespaces, currentNamespace, schema, value.additionalProperties);
  }
  // if ('choices' in value) {
  //   newValue.choices = value.choices.map((choice) => expandValues(
  //     namespaces, currentNamespace, schema, choice));
  // }
  return newValue;
}

function expandValues(namespaces, namespace, schema, toExpand) {
  if (typeof(toExpand) === 'object') {
    return Object.keys(toExpand).reduce((obj, key) => {
      return ({
        ...obj,
        [key]: expandValue(namespaces, namespace, schema, key, toExpand[key]),
      });
    }, {});
  }
  return toExpand;
}

function expandNamespaceRefs(namespaces) {
  return Object.keys(namespaces).reduce((obj, namespace) => {
    const schema = namespaces[namespace];
    return {
      ...obj,
      [namespace]: {
        ...schema,
        types: expandValues(namespaces, namespace, schema, schema.types),
        properties: expandValues(namespaces, namespace, schema, schema.properties),
        additionalProperties: expandValues(
          namespaces, namespace, schema, schema.additionalProperties),
        // choices: expandValues(namespaces, namespace, schema, schema.types),
      },
    };
  }, {});
}

function loadNamespaces(namespaces, startSchema = {}) {
  const schema = namespaces.reduce((schema, { namespace, ...value }) => {
    return ({
      ...schema,
      [namespace]: {
        ...schema[namespace],
        types: loadTypes({ namespace, ...value }),
      },
    });
  }, startSchema);
  return expandNamespaceRefs(schema);
}

const namespaces = Array.prototype.concat.call(
  [],
  extensionTypesNamespaces,
  manifestNamespaces,
);

const schema = loadNamespaces(namespaces);
import sinon from 'sinon';
console.log(JSON.stringify(schema));
