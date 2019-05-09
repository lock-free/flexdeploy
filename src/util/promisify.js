module.exports = (fn) => {
  if (typeof fn !== 'function') {
    throw new Error(`Expect function to promisify, but got ${fn}`);
  }
  return async (...args) => {
    return new Promise((resolve, reject) => {
      try {
        fn(...args, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  };
};
