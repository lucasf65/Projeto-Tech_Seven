function matches(id, data, [field, operator, value]) {
  const actual = field === '__name__' ? id : data[field];
  switch (operator) {
    case '==': return actual === value;
    case '>=': return actual >= value;
    case '<=': return actual <= value;
    case 'in': return value.includes(actual);
    default: throw new Error(`Unsupported query operator: ${operator}`);
  }
}

function snapshot(id, value) {
  return { id, exists: value !== undefined, data: () => structuredClone(value) };
}

function read(store, reference) {
  const collection = store.get(reference.collectionName) ?? new Map();
  if (reference instanceof DocumentReference) {
    return snapshot(reference.id, collection.get(reference.id));
  }

  const docs = [...collection]
    .filter(([id, data]) => reference.filters.every(filter => matches(id, data, filter)))
    .map(([id, data]) => snapshot(id, data));
  return { docs, empty: docs.length === 0, size: docs.length };
}

function write(store, reference, value, operation, merge = false) {
  const { collectionName, id } = reference;
  if (!store.has(collectionName)) store.set(collectionName, new Map());
  const collection = store.get(collectionName);
  if (operation === 'create' && collection.has(id)) throw new Error(`Already exists: ${reference.path}`);
  if (operation === 'update' && !collection.has(id)) throw new Error(`Missing document: ${reference.path}`);
  const data = structuredClone(value);
  collection.set(id, merge ? { ...collection.get(id), ...data } : data);
}

class DocumentReference {
  constructor(db, collectionName, id) {
    Object.assign(this, { db, collectionName, id, path: `${collectionName}/${id}` });
  }

  async get() {
    return this.db.read(this);
  }

  async set(data, { merge = false } = {}) {
    return this.db.runTransaction(transaction => transaction.set(this, data, { merge }));
  }
}

class Query {
  constructor(db, collectionName, filters = []) {
    Object.assign(this, { db, collectionName, filters });
  }

  where(field, operator, value) {
    return new Query(this.db, this.collectionName, [...this.filters, [field, operator, value]]);
  }

  async get() {
    return this.db.read(this);
  }
}

class CollectionReference extends Query {
  doc(id = this.db.nextId(this.collectionName)) {
    return new DocumentReference(this.db, this.collectionName, id);
  }
}

export class MemoryFirestore {
  #store = new Map();
  #pending = Promise.resolve();
  #counter = 0;

  constructor(seed = {}) {
    for (const [collection, documents] of Object.entries(seed)) {
      for (const [id, data] of Object.entries(documents)) this.seed(collection, id, data);
    }
  }

  seed(collection, id, data) {
    write(this.#store, this.collection(collection).doc(id), data, 'set');
    return this;
  }

  collection(name) {
    return new CollectionReference(this, name);
  }

  nextId(collection) {
    let id;
    do {
      id = `generated-${++this.#counter}`;
    } while (this.#store.get(collection)?.has(id));
    return id;
  }

  read(reference) {
    return read(this.#store, reference);
  }

  runTransaction(callback) {
    const result = this.#pending.then(async () => {
      const staged = new Map([...this.#store].map(([name, documents]) => [name, new Map(documents)]));
      let wrote = false;
      function stage(reference, data, operation, merge = false) {
        wrote = true;
        write(staged, reference, data, operation, merge);
        return transaction;
      }
      const transaction = {
        get: async reference => {
          if (wrote) throw new Error('Transaction reads must precede writes');
          return read(staged, reference);
        },
        create: (reference, data) => stage(reference, data, 'create'),
        set: (reference, data, { merge = false } = {}) => stage(reference, data, 'set', merge),
        update: (reference, data) => stage(reference, data, 'update', true)
      };
      const value = await callback(transaction);
      this.#store = staged;
      return value;
    });
    this.#pending = result.catch(() => undefined);
    return result;
  }
}
