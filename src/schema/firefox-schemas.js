import manifestSchema from './firefox-manifest.json';
import extensionTypesSchema from './firefox-extension-types.json';

const VALID_TYPES = [
  'array',
  'boolean',
  'null',
  'number',
  'object',
  'string',
];

function loadTypes(types) {
  // Convert the array of types to an object.
  return types.reduce((obj, type) => ({
    ...obj,
    [type.id]: type,
  }), {});
}

function expandValue(namespaces, currentNamespace, schema, name, value) {
  if (typeof value !== 'object') {
    return value;
  }
  if ('$ref' in value) {
    let lookupId = value.$ref;
    let namespace = currentNamespace;
    if (lookupId.includes('.')) {
      [ namespace, lookupId ] = lookupId.split('.');
    }
    const lookupNamespace = namespaces[namespace].types;
    // eslint-disable-next-line no-unused-vars
    const { $ref, ...newValue } = value;
    // eslint-disable-next-line no-unused-vars
    const { id, ...ref } = lookupNamespace[lookupId];
    return expandValue(
      namespaces, currentNamespace, schema, name, { ...ref, ...newValue });
  }
  const { ...newValue } = value;
  if ('types' in value) {
    newValue.types = expandValues(
      namespaces, currentNamespace, schema, value.types);
  }
  if ('properties' in value) {
    newValue.properties = expandValues(
      namespaces, currentNamespace, schema, value.properties);
  }
  if ('additionalProperties' in value &&
      typeof value.additionalProperties === 'object') {
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
        properties: expandValues(
          namespaces, namespace, schema, schema.properties),
        additionalProperties: expandValues(
          namespaces, namespace, schema, schema.additionalProperties),
        // choices: expandValues(namespaces, namespace, schema, schema.types),
      },
    };
  }, {});
}

// eslint-disable-next-line no-unused-vars
function loadNamespaces(namespaces, startSchema = {}) {
  const schema = namespaces.reduce((schema, { namespace, ...value }) => {
    return ({
      ...schema,
      [namespace]: {
        ...schema[namespace],
        types: loadTypes(value.types),
      },
    });
  }, startSchema);
  return expandNamespaceRefs(schema);
}

function normalizeSchema(schema) {
  const { types, ...rest } = schema[0];
  return {
    ...rest,
    properties: loadTypes(types),
  };
}

function rewriteFile(name) {
  return {
    extensionTypes: 'extensionTypes.json',
  }[name] || name;
}

function rewriteRef(key, value) {
  if (Array.isArray(value)) {
    return value.map((val) => rewriteRef(key, val));
  } else if (typeof value === 'object') {
    return rewriteRefs(value);
  } else if (key === '$ref') {
    let path = value;
    let file = '';
    if (value.includes('.')) {
      [file, path] = value.split('.', 2);
    }
    return `${file}#/properties/${path}`;
  } else if (key === 'type' && value === 'any') {
    return VALID_TYPES;
  } else if (key === 'id') {
    return undefined;
  }
  return value;
}

function rewriteRefs(schema) {
  return Object.keys(schema).reduce((obj, key) => {
    const value = rewriteRef(key, schema[key]);
    if (value === undefined) {
      return obj;
    }
    return { ...obj, [key]: value };
  }, {});
}

function loadSchema(schema, id) {
  return {
    ...rewriteRefs(normalizeSchema(schema, id)),
    id,
  };
}

function getSchemaId() {
  // eg ['node', 'firefox-schemas.js', 'manifest']
  return process.argv[2];
}

function pickSchema(id) {
  return {
    manifest: manifestSchema,
    extensionTypes: extensionTypesSchema,
  }[id];
}

const schemaId = getSchemaId();
const schema = loadSchema(pickSchema(schemaId), schemaId);
// eslint-disable-next-line no-console
console.log(JSON.stringify(schema));
