import fs from 'fs';

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

function normalizeSchema(schema) {
  const { namespace, types, ...rest } = schema[0];
  return {
    ...rest,
    id: namespace,
    types: loadTypes(types),
  };
}

function rewriteRef(key, value) {
  if (Array.isArray(value)) {
    return value.map((val) => rewriteRef(key, val));
  } else if (typeof value === 'object') {
    return rewriteRefs(value);
  } else if (key === '$ref') {
    let path = value;
    let schemaId = '';
    if (value.includes('.')) {
      [schemaId, path] = value.split('.', 2);
    }
    return `${schemaId}#/types/${path}`;
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

function loadSchema(schema) {
  const { id, ...rest } = normalizeSchema(schema);
  const newSchema = { id, ...rewriteRefs(rest) };
  if (id === 'manifest') {
    newSchema.$ref = '#/types/WebExtensionManifest';
  }
  return newSchema;
}

function readSchema(path, file) {
  return JSON.parse(fs.readFileSync(`${path}/${file}`));
}

function writeSchema(path, file, schema) {
  fs.writeFile(`${path}/${file}`, JSON.stringify(schema, undefined, 2));
}

function schemaFiles(path) {
  return fs.readdirSync(path);
}

function importSchemas() {
  const path = process.argv[2];
  schemaFiles(path).forEach((file) => {
    const schema = loadSchema(readSchema(path, file));
    writeSchema(`${path}/../imported`, file, schema);
  });
}

importSchemas();
