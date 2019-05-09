const {
  getDirMd5FileMapping,
  diffListByLayer
} = require('../src/util');
const path = require('path');
const assert = require('assert');
const log = console.log; // eslint-disable-line

describe('index', () => {
  it('base', async () => {
    assert.deepEqual({
      'type': 'dir',
      'files': {
        'a.text': {
          'type': 'file',
          'md5': 'e7df7cd2ca07f4f1ab415d457a6e1c13'
        },
        'sub': {
          'type': 'dir',
          'files': {
            'b.text': {
              'type': 'file',
              'md5': '341f9041b1ba9a11317cc6eb2bddb055'
            }
          }
        }
      }
    }, await getDirMd5FileMapping(path.join(__dirname, './fixture/testDir')));
  });

  it('diffListByLayer', () => {
    assert.deepEqual(diffListByLayer({
      type: 'dir',
      files: {}
    }, {
      type: 'dir',
      files: {}
    }), []);

    assert.deepEqual(diffListByLayer({
      'type': 'dir',
      'files': {
        'a.text': {
          'type': 'file',
          'md5': 'e7df7cd2ca07f4f1ab415d457a6e1c13'
        },
        'sub': {
          'type': 'dir',
          'files': {
            'b.text': {
              'type': 'file',
              'md5': '341f9041b1ba9a11317cc6eb2bddb055'
            }
          }
        }
      }
    }, {
      'type': 'dir',
      'files': {
        'a.text': {
          'type': 'file',
          'md5': '12df7cd2ca07f4f1ab415d457a6e1c13'
        },
        'sub': {
          'type': 'dir',
          'files': {
            'b.text': {
              'type': 'file',
              'md5': '981f9041b1ba9a11317cc6eb2bddb055'
            }
          }
        }
      }
    }), [

      {
        diffType: 'diffMd5',
        path: ['a.text']
      },
      {
        diffType: 'diffMd5',
        path: ['sub', 'b.text']
      }
    ]);
  });

  it('diffListByLayer: remove old', () => {
    assert.deepEqual(diffListByLayer({
      'type': 'dir',
      'files': {
        'a.text': {
          'type': 'file',
          'md5': '12df7cd2ca07f4f1ab415d457a6e1c13'
        },
        'sub': {
          'type': 'dir',
          'files': {}
        }
      }
    }, {
      'type': 'dir',
      'files': {
        'a.text': {
          'type': 'file',
          'md5': '12df7cd2ca07f4f1ab415d457a6e1c13'
        },
        'sub': {
          'type': 'dir',
          'files': {
            'b.text': {
              'type': 'file',
              'md5': '981f9041b1ba9a11317cc6eb2bddb055'
            }
          }
        }
      }
    }), [{
      diffType: 'removeOld',
      path: ['sub', 'b.text']
    }]);
  });

  it('diffListByLayer: add new', () => {
    assert.deepEqual(diffListByLayer({
      'type': 'dir',
      'files': {
        'a.text': {
          'type': 'file',
          'md5': '12df7cd2ca07f4f1ab415d457a6e1c13'
        },
        'sub': {
          'type': 'dir',
          'files': {
            'b.text': {
              'type': 'file',
              'md5': '981f9041b1ba9a11317cc6eb2bddb055'
            }
          }
        }
      }
    }, {
      'type': 'dir',
      'files': {
        'a.text': {
          'type': 'file',
          'md5': '12df7cd2ca07f4f1ab415d457a6e1c13'
        },
        'sub': {
          'type': 'dir',
          'files': {}
        }
      }
    }), [{
      diffType: 'addNew',
      path: ['sub', 'b.text']
    }]);
  });
});
