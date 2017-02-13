import manifestNamespaces from './firefox-manifest.json';
import extensionTypesNamespaces from './firefox-extension-types.json';

function loadTypes(schema) {
  const types = {};
  schema.types.forEach((type) => {
    types[type.id] = type;
  });
  return types;
}

function expandProperty(namespaces, currentNamespace, schema, name, value) {
  console.log('expanding', name, Object.keys(value));
  if (typeof value !== 'object') {
    return value;
  }
  if ('$ref' in value) {
    let lookupId = value['$ref'];
    let namespace = currentNamespace;
    if (lookupId.includes('.')) {
      [ namespace, lookupId ] = lookupId.split('.');
    }
    const lookupNamespace = namespaces[namespace];
    const { $ref, ...newValue } = value;
    const { id, ...ref } = lookupNamespace[lookupId];
    console.log('expanded', name, id, Object.keys(newValue), Object.keys(ref));
    return expandProperty(namespaces, currentNamespace, schema, name, { ...newValue, ...ref });
  }
  const { ...newValue } = value;
  if ('properties' in value) {
    newValue.properties = expandProperties(namespaces, currentNamespace, schema, value.properties);
  }
  if ('additionalProperties' in value && typeof value.additionalProperties === 'object') {
    newValue.additionalProperties = expandProperties(
      namespaces, currentNamespace, schema, value.additionalProperties);
  }
  // if ('choices' in value) {
  //   newValue.choices = value.choices.map((choice) => expandProperties(
  //     namespaces, currentNamespace, schema, choice));
  // }
  return newValue;
}

function expandProperties(namespaces, namespace, schema, properties) {
  return Object.keys(properties).reduce((obj, property) => ({
    ...obj,
    [property]: expandProperty(namespaces, namespace, schema, property, properties[property]),
  }), {});
}

function expandNamespaceRefs(namespaces) {
  return Object.keys(namespaces).reduce((obj, namespace) => {
    return {
      ...namespaces,
      [namespace]: expandRefs(namespaces, namespace, namespaces[namespace]),
    };
  }, {});
}

function expandRefs(namespaces, namespace, schema) {
  return Object.keys(schema).reduce((obj, type) => {
    if ('properties' in schema[type]) {
      return {
        ...obj,
        [type]: {
          ...schema[type],
          properties: expandProperties(namespaces, namespace, schema, schema[type].properties),
        },
      };
    }
    return obj;
  }, {});
}

function loadNamespaces(namespaces, startSchema = {}) {
  const schema = namespaces.reduce((schema, { namespace, ...value }) => {
    console.log('loadNamespaces', namespaces.length, namespace);
    return ({
      ...schema,
      [namespace]: {
        ...schema[namespace],
        ...loadTypes({ namespace, ...value }),
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
console.log(sinon.format(schema));
