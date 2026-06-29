// Helper function to format phase index based on pattern (shared by offer and invoice)
export const formatPhaseIndex = (pattern: string, index: number): string => {
  const toRoman = (num: number): string => {
    const romanNumerals: [number, string][] = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];
    let result = "";
    let n = num;
    for (const [value, numeral] of romanNumerals) {
      while (n >= value) {
        result += numeral;
        n -= value;
      }
    }
    return result;
  };

  const toUpperLetter = (num: number): string => {
    return String.fromCharCode(64 + num); // A=1, B=2, etc.
  };

  const toLowerLetter = (num: number): string => {
    return String.fromCharCode(96 + num); // a=1, b=2, etc.
  };

  return pattern
    .replace(/(?<![A-Za-z0-9])1(?![A-Za-z])/g, String(index))
    .replace(/(?<![A-Za-z0-9])A(?![A-Za-z0-9])/g, toUpperLetter(index))
    .replace(/(?<![A-Za-z0-9])a(?![A-Za-z0-9])/g, toLowerLetter(index))
    .replace(/(?<![A-Za-z0-9])I(?![A-Za-z0-9])/g, toRoman(index));
};
