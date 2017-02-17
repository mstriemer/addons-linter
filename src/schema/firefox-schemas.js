import fs from 'fs';

// TODO: Handle /* \n...\n*/ style comments in schemas.
// TODO: Rewrite `optional`: false to `required`: [<fields>].

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
const FLAG_PATTERN_REGEX = /^\(\?[im]*\)(.*)/;

function loadTypes(types) {
  // Convert the array of types to an object.
  return types.reduce((obj, type) => ({
    ...obj,
    [type.id]: type,
  }), {});
}

function rewriteExtend(schemas, schemaId) {
  const definitions = {};
  const refs = {};
  schemas.forEach((extendSchema) => {
    const extendId = extendSchema.namespace;
    extendSchema.types.forEach((type) => {
      const { $extend, ...rest } = type;
      // Move the $extend into definitions.
      definitions[$extend] = rest;
      // Remember the location of this file so we can $ref it later.
      refs[`${schemaId}#/definitions/${$extend}`] = {
        namespace: extendId,
        type: $extend,
      };
    });
  });
  return { definitions, refs };
}

function normalizeSchema(schemas) {
  let extendSchemas;
  let primarySchema;

  if (schemas.length === 1) {
    primarySchema = schemas[0];
    extendSchemas = [];
  } else {
    extendSchemas = schemas.slice(0, schemas.length - 1);
    primarySchema = schemas[schemas.length - 1];
  }
  const { namespace, types, ...rest } = primarySchema;
  return {
    ...rest,
    ...rewriteExtend(extendSchemas, namespace),
    id: namespace,
    types: loadTypes(types),
  };
}

function stripFlagsFromPattern(value) {
  // TODO: Fix these patterns and remove this code.
  const matches = FLAG_PATTERN_REGEX.exec(value);
  if (matches) {
    return matches[1];
  }
  return value;
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
  } else if (key === 'pattern') {
    return stripFlagsFromPattern(value);
  }
  return value;
}

function rewriteKey(key) {
  if (key === 'choices') {
    return 'anyOf';
  }
  return key;
}

function rewriteRefs(schema) {
  return Object.keys(schema).reduce((obj, key) => {
    const value = rewriteRef(key, schema[key]);
    if (value === undefined) {
      return obj;
    }
    return { ...obj, [rewriteKey(key)]: value };
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

function loadSchemasFromFile(path) {
  const loadedSchemas = {};
  // Read the schemas into loadedSchemas.
  schemaFiles(path).forEach((file) => {
    const schema = loadSchema(readSchema(path, file));
    loadedSchemas[schema.id] = {
      file,
      schema,
    };
  });
  return loadedSchemas;
}

function writeSchemasToFile(path, loadedSchemas) {
  // Write out the schemas.
  Object.keys(loadedSchemas).forEach((id) => {
    const { file, schema } = loadedSchemas[id];
    writeSchema(`${path}/../imported`, file, schema);
  });
}

function importSchemas() {
  const path = process.argv[2];
  const loadedSchemas = loadSchemasFromFile(path);
  // Map $extend to $ref.
  Object.keys(loadedSchemas).forEach((id) => {
    const { schema } = loadedSchemas[id];
    Object.keys(schema.refs).forEach((ref) => {
      const { namespace, type } = schema.refs[ref];
      const extendSchema = loadedSchemas[namespace].schema;
      const extendType = extendSchema.types[type];
      if ('anyOf' in extendType) {
        extendType.anyOf.push({ $ref: ref });
      } else {
        if (!('allOf' in extendType)) {
          extendSchema.types[type] = { allOf: [extendType] };
        }
        extendSchema.types[type].allOf.push({ $ref: ref });
      }
    });
  });
  writeSchemasToFile(path, loadedSchemas);
}

importSchemas();
