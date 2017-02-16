import fs from 'fs';

const VALID_TYPES = [
  'array',
  'boolean',
  'null',
  'number',
  'object',
  'string',
];
const VALID_SCHEMAS = [
  'downloads.json',
  'i18n.json',
  'manifest.json',
  'extension_types.json',
];

function loadTypes(types) {
  // Convert the array of types to an object.
  return types.reduce((obj, type) => ({
    ...obj,
    [type.id]: type,
  }), {});
}

function rewriteTypeExtensions(typeExtensions) {
  return typeExtensions.reduce((schema, type) => {
    const { $extend, ...rest } = type;
    return {
      ...schema,
      [$extend]: rest,
    };
  }, {});
}

function rewriteExtend(schemas) {
  return schemas.reduce((schema, extendSchema) => {
    return {
      ...schema,
      ...rewriteTypeExtensions(extendSchema.types),
    };
  }, {});
}

function normalizeSchema(schemas) {
  let primarySchema;

  if (schemas.length === 1) {
    primarySchema = schemas[0];
  } else {
    const extendSchemas = schemas.slice(0, schemas.length - 1);
    primarySchema = rewriteExtend(extendSchemas);
    primarySchema = {
      ...schemas[schemas.length - 1],
      definitions: rewriteExtend(extendSchemas),
    };
  }
  const { namespace, types, ...rest } = primarySchema;
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
  const lines = fs.readFileSync(`${path}/${file}`, 'utf-8').split('\n');
  const jsonContents = lines.reduce((arr, line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      return arr;
    }
    arr.push(line);
    return arr;
  }, []).join('\n');
  return JSON.parse(jsonContents);
}

function writeSchema(path, file, schema) {
  fs.writeFile(`${path}/${file}`, JSON.stringify(schema, undefined, 2));
}

function schemaFiles(path) {
  return fs.readdirSync(path).filter((file) => VALID_SCHEMAS.includes(file));
}

function importSchemas() {
  const path = process.argv[2];
  schemaFiles(path).forEach((file) => {
    const schema = loadSchema(readSchema(path, file));
    writeSchema(`${path}/../imported`, file, schema);
  });
}

importSchemas();
