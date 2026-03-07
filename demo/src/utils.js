// Code smells and bugs

// S3504: var instead of let/const
var globalCounter = 0;

// S1481: Unused variable
var unusedConfig = { debug: true };

// S2703: Implicit global
function incrementCounter() {
  result = globalCounter + 1;
  globalCounter = result;
}

// S2201: Ignored return value
function processData(items) {
  items.map(item => item * 2);
  items.filter(item => item > 0);
  return items;
}

// S1854: Dead store
function calculateTotal(prices) {
  let total = 0;
  total = prices.reduce((sum, p) => sum + p, 0);
  total = prices.reduce((sum, p) => sum + p, 0);
  return total;
}

// S2589: Always truthy
function validate(input) {
  if (typeof input === "string") {
    if (typeof input === "string") {
      return input.trim();
    }
  }
  return input;
}

// S1116: Empty statement
;;

// S1134 / S1135: FIXME and TODO tags
// FIXME: this function is broken
// TODO: refactor this mess

function legacySort(arr) {
  // S2092: Cookie without secure flag (conceptual)
  for (var i = 0; i < arr.length; i++) {
    for (var j = 0; j < arr.length; j++) {
      if (arr[i] < arr[j]) {
        var temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
      }
    }
  }
  return arr;
}

module.exports = { incrementCounter, processData, calculateTotal, validate, legacySort };
