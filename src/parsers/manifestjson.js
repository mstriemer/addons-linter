import path from 'path';

import RJSON from 'relaxed-json';
import validate from 'schema/validator';

import { getConfig } from 'cli';
import {
  MANIFEST_JSON,
  MIN_ICON_SIZE,
  PACKAGE_EXTENSION,
  RECOMMENDED_ICON_SIZE,
} from 'const';
import log from 'logger';
import * as messages from 'messages';
import JSONParser from 'parsers/json';
import { isToolkitVersionString } from 'schema/formats';
import { singleLineString } from 'utils';

function normalizePath(iconPath) {
  if (iconPath.startsWith('/')) {
    return iconPath.slice(1);
  } else if (iconPath.startsWith('./')) {
    return iconPath.slice(2);
  }
  return iconPath;
}

export default class ManifestJSONParser extends JSONParser {

  constructor(jsonString, collector, {
    filename=MANIFEST_JSON, RelaxedJSON=RJSON,
    selfHosted=getConfig().argv.selfHosted,
    io=null,
  }={}) {
    super(jsonString, collector, { filename: filename });

    this.parse(RelaxedJSON);

    // Set up some defaults in case parsing fails.
    if (typeof this.parsedJSON === 'undefined' || this.isValid === false) {
      this.parsedJSON = {
        manifest_version: null,
        name: null,
        type: PACKAGE_EXTENSION,
        version: null,
      };
    } else {
      // We've parsed the JSON; now we can validate the manifest.
      this.selfHosted = selfHosted;
      this.io = io;
      this._validate();
    }
  }

  errorLookup(error) {
    // This is the default message.
    var baseObject = messages.JSON_INVALID;

    // This is the default from webextension-manifest-schema, but it's not a
    // super helpful error. We'll tidy it up a bit:
    if (error && error.message) {
      let lowerCaseMessage = error.message.toLowerCase();
      if (lowerCaseMessage === 'should not have additional properties') {
        error.message = 'is not a valid key or has invalid extra properties';
      }
    }

    var overrides = {
      message: `"${error.dataPath}" ${error.message}`,
      dataPath: error.dataPath,
    };

    if (error.keyword === 'required') {
      baseObject = messages.MANIFEST_FIELD_REQUIRED;
    } else if (error.dataPath.startsWith('/permissions') &&
               typeof error.data !== 'undefined' &&
               typeof error.data !== 'string') {
      baseObject = messages.MANIFEST_BAD_PERMISSION;
      overrides.message = `Permissions ${error.message}.`;
    } else if (error.keyword === 'type') {
      baseObject = messages.MANIFEST_FIELD_INVALID;
    }

    // Arrays can be extremely verbose, this tries to make them a little
    // more sane. Using a regex because there will likely be more as we
    // expand the schema.
    var match = error.dataPath.match(/^\/(permissions)\/([\d+])/);
    if (match && baseObject.code !== messages.MANIFEST_BAD_PERMISSION.code) {
      baseObject = messages[`MANIFEST_${match[1].toUpperCase()}`];
      overrides.message = singleLineString`/${match[1]}: Unknown ${match[1]}
          "${error.data}" at ${match[2]}.`;
    }

    return Object.assign({}, baseObject, overrides);
  }

  _validate() {
    // Not all messages returned by the schema are fatal to Firefox, messages
    // that are just warnings should be added to this array.
    var warnings = [messages.MANIFEST_PERMISSIONS.code];

    this.isValid = validate(this.parsedJSON);
    if (!this.isValid) {
      log.debug('Schema Validation messages', validate.errors);

      for (let error of validate.errors) {
        var message = this.errorLookup(error);

        if (warnings.includes(message.code)) {
          this.collector.addWarning(message);
        } else {
          this.collector.addError(message);
        }

        // Add-ons with bad permissions will fail to install in Firefox, so
        // we consider them invalid.
        if (message.code === messages.MANIFEST_BAD_PERMISSION.code) {
          this.isValid = false;
        }
      }
    }

    if (this.parsedJSON.content_security_policy) {
      this.collector.addWarning(messages.MANIFEST_CSP);
    }

    if (this.parsedJSON.update_url) {
      this.collector.addNotice(messages.MANIFEST_UNUSED_UPDATE);
    }

    if (this.parsedJSON.icons) {
      this.validateIcons();
    }

    if (!this.selfHosted && this.parsedJSON.applications &&
        this.parsedJSON.applications.gecko &&
        this.parsedJSON.applications.gecko.update_url) {
      this.collector.addError(messages.MANIFEST_UPDATE_URL);
      this.isValid = false;
    }

    if (isToolkitVersionString(this.parsedJSON.version)) {
      this.collector.addNotice(messages.PROP_VERSION_TOOLKIT_ONLY);
    }

    if (this.parsedJSON.default_locale) {
      let msg = path.join(
        '_locales', this.parsedJSON.default_locale, 'messages.json');
      if (!this.io.files[msg]) {
        this.collector.addError(messages.NO_MESSAGES_FILE);
        this.isValid = false;
      }
    }

    if (!this.parsedJSON.default_locale && this.io) {
      let match_re = /^_locales\/.*?\/messages.json$/;
      for (let filePath in this.io.files) {
        if (filePath.match(match_re)) {
          this.collector.addError(messages.NO_DEFAULT_LOCALE);
          this.isValid = false;
          break;
        }
      }
    }
  }

  validateIcons() {
    const { icons } = this.parsedJSON;
    Object.keys(icons).forEach((size) => {
      const path = normalizePath(icons[size]);
      if (!this.io.files.hasOwnProperty(path)) {
        this.collector.addError(messages.manifestIconMissing(path));
        this.isValid = false;
      }
    });
    const hasIconOfSize = (size) =>
      Object.keys(icons).some((iconSize) => parseInt(iconSize, 10) >= size);
    if (!hasIconOfSize(MIN_ICON_SIZE)) {
      this.collector.addError(messages.MIN_ICON_SIZE);
      this.isValid = false;
    }
    if (!hasIconOfSize(RECOMMENDED_ICON_SIZE)) {
      this.collector.addWarning(messages.RECOMMENDED_ICON_SIZE);
    }
  }

  getAddonId() {
    try {
      var id = this.parsedJSON.applications.gecko.id;
      return typeof id === 'undefined' ? null : id;
    } catch (e) {
      log.error('Failed to get the id from the manifest.');
      return null;
    }
  }

  getMetadata() {
    return {
      id: this.getAddonId(),
      manifestVersion: this.parsedJSON.manifest_version,
      name: this.parsedJSON.name,
      type: PACKAGE_EXTENSION,
      version: this.parsedJSON.version,
    };
  }
}
