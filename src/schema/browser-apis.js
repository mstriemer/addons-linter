import schemaList from './firefox-schemas';

const schemaArrayNames = ['functions', 'events'];
const schemaObjectNames = ['types', 'properties'];
const schemas = schemaList.reduce((all, current) => ({
  ...all,
  [current.id]: current,
}), {});

export function hasBrowserApi(namespace, property) {
  const schema = schemas[namespace];
  return Boolean(schema)
    && (
      schemaObjectNames.some(
        (schemaProperty) =>
          schema[schemaProperty] && property in schema[schemaProperty])
      || schemaArrayNames.some((schemaProperty) => {
        const namespaceProperties = schema[schemaProperty];
        return Array.isArray(namespaceProperties) &&
          namespaceProperties.some(
            (schemaItem) => schemaItem.name === property);
      }));
}
