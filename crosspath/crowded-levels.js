// Copyright (C) 2026 Pelagic Games

// Crowded-mode catalogue.
// Within each band, puzzles run from least to most crowded.
(() => {
  window.CrosspathCrowdedLevels = [
    {
      title: "Puzzle 1",
      difficulty: "very-easy",
      crowdedness: 2,
      code: "T: 0000006aa 000000aaa aac005005 03f003000 005005aa9 6aa3c0afc aaa000000 005005005 c00900000 F: 6@1 4@4 9@5 X: W3 S1"
    },
    {
      title: "Puzzle 2",
      difficulty: "very-easy",
      crowdedness: 9,
      code: "T: 3c0afa690 03c06903c 6a9900c00 000000c00 500906003 0000006aa fc03fc039 006005aa9 5005003aa F: 2@3 5@5 3@6 9@7 8@8 X: -"
    },
    {
      title: "Puzzle 3",
      difficulty: "very-easy",
      crowdedness: 19,
      code: "T: a90c00900 c00900c00 000006005 5003c003c 53f56f393 06cc5553f 3af00306a 000000aaa 6c553956c F: 6@2 9@4 7@5 5@7 1@8 X: -"
    },
    {
      title: "Puzzle 4",
      difficulty: "very-easy",
      crowdedness: 21,
      code: "T: aaa000000 afc039000 003000000 693faa3ac 6ac5053c5 6ac569550 00006a050 93cc69390 03c069050 F: 7@3 4@4 1@8 X: -"
    },
    {
      title: "Puzzle 5",
      difficulty: "very-easy",
      crowdedness: 36,
      code: "T: 550550550 c065053c5 a95ac5c55 006005005 550ffc939 5393c6a93 c50550550 695505503 6af3af06f F: 2@2 8@7 6@8 5@9 X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "very-easy",
      crowdedness: 46,
      code: "T: c3cfc5555 a96ac3690 6a956a396 939aacaa9 3c6affa93 6c6f95969 00500306a c005003c0 6fa556395 F: 7@1 6@2 5@8 X: -"
    },
    {
      title: "Puzzle 1",
      difficulty: "easy",
      crowdedness: 4,
      code: "T: ac6039000 aac005c05 5005003aa aa9000000 053afc039 00000006c 6aa500500 3aa0006aa 3a9006aa9 F: 7@1 8@4 3@7 9@8 X: -"
    },
    {
      title: "Puzzle 2",
      difficulty: "easy",
      crowdedness: 8,
      code: "T: 050050050 000aaa000 06c6933c6 5393c0050 069c50ffc 000000ac0 039000000 6905063a9 03cc053a9 F: 5@3 2@8 X: N9 W3"
    },
    {
      title: "Puzzle 3",
      difficulty: "easy",
      crowdedness: 10,
      code: "T: 0000006ac 000c00900 690500500 ac0afa050 6ac905069 006003000 50596903a 5003aaaaa 03a000000 F: - X: E4 W8"
    },
    {
      title: "Puzzle 4",
      difficulty: "easy",
      crowdedness: 20,
      code: "T: c00fc053a af903c005 3966a9506 0060696fa 005005aa9 ac0afc055 56f53f3a9 aaf005aa9 a9606fa95 F: 5@9 X: -"
    },
    {
      title: "Puzzle 5",
      difficulty: "easy",
      crowdedness: 32,
      code: "T: 003000aaa 6c03fac50 c6c3f9a90 56cf953c5 6aa5063af 0696fc393 c39fac3a9 93aac6a95 6ac505903 F: 5@4 8@5 7@6 X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "easy",
      crowdedness: 42,
      code: "T: 000006003 6c5ff993a a95c053a9 6c693faa9 5503fa03a c56939aac 3f96fc955 03a6aa56a aac6c5555 F: - X: N2 N5"
    },
    {
      title: "Puzzle 1",
      difficulty: "medium",
      crowdedness: 3,
      code: "T: fc0390000 00000006a 03c005aa9 6aa500500 055af9050 c00500500 000000aaa 06c055055 5003aa000 F: 9@5 X: -"
    },
    {
      title: "Puzzle 2",
      difficulty: "medium",
      crowdedness: 9,
      code: "T: 06a050690 aaa000000 3ac005aa9 5005003aa 500500500 a900006aa 000000c00 aaa06a050 aacaa9000 F: 8@2 X: -"
    },
    {
      title: "Puzzle 3",
      difficulty: "medium",
      crowdedness: 17,
      code: "T: c69550550 000c003ac 00506903a 06c053afc 000000aaa 050a96005 03faa9000 00000006a 53a3acaa9 F: 6@4 X: -"
    },
    {
      title: "Puzzle 4",
      difficulty: "medium",
      crowdedness: 20,
      code: "T: 039000000 6c5539900 0036c0556 c3c505905 000c06969 6af3c5055 c6c393006 539fc093a 000006003 F: - X: -"
    },
    {
      title: "Puzzle 5",
      difficulty: "medium",
      crowdedness: 32,
      code: "T: 3c06fc393 6c0556555 553556539 5003ac6a9 3a9c00500 55053a900 afaa906c0 fac56953c 000c003c0 F: - X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "medium",
      crowdedness: 40,
      code: "T: 0006ac969 6c5955693 c56553956 56c395003 3f9050a90 6f955093a 00006c695 905ac5c55 3aa06c693 F: - X: -"
    },
    {
      title: "Puzzle 1",
      difficulty: "hard",
      crowdedness: 2,
      code: "T: 005aaf005 ac0a90000 000000c00 06caf9050 06c03f005 aaf003000 6aa5003ac 5003aa000 03caa9000 F: - X: -"
    },
    {
      title: "Puzzle 2",
      difficulty: "hard",
      crowdedness: 9,
      code: "T: 900000000 c69ffc395 000aaa000 0006aa500 006003000 6a93c0a90 ac06903aa 000000aaa 000aac005 F: - X: -"
    },
    {
      title: "Puzzle 3",
      difficulty: "hard",
      crowdedness: 11,
      code: "T: 5005003aa 06c053a90 56995003a 06c695503 500500500 005005003 050050a96 00006cc55 3f903cc05 F: - X: -"
    },
    {
      title: "Puzzle 4",
      difficulty: "hard",
      crowdedness: 24,
      code: "T: 6aa500500 5393c0afc 03c6af3a9 af9a906aa aaa00006c 500faa3aa 56a5563f9 9506fc555 039c00900 F: - X: -"
    },
    {
      title: "Puzzle 5",
      difficulty: "hard",
      crowdedness: 36,
      code: "T: 0006ac569 f963c5039 000000c00 6a93ac003 06a696569 aacac5055 3ac003000 53a56c395 a956c5539 F: - X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "hard",
      crowdedness: 46,
      code: "T: 3aa6aa3ac c6af96569 6c353a56c c53ffc393 55555353a c00500900 c0096c6f9 55093aac6 550950a90 F: - X: -"
    },
    {
      title: "Puzzle 1",
      difficulty: "very-hard",
      crowdedness: 3,
      code: "T: 005aa9000 500900000 5003aa000 aaac003c0 6af505503 c003c0050 a90000c00 05005003c 06f03f005 F: - X: -"
    },
    {
      title: "Puzzle 2",
      difficulty: "very-hard",
      crowdedness: 8,
      code: "T: ac0a90000 000000006 000000c00 aac0056a9 6affaf3a9 006003000 5003aa000 faa900000 3c06fc939 F: - X: -"
    },
    {
      title: "Puzzle 3",
      difficulty: "very-hard",
      crowdedness: 13,
      code: "T: 6aa3aa000 00600306a c005003aa 000aac005 ac0c3a500 005005005 6a9500900 056055a95 900c00900 F: - X: -"
    },
    {
      title: "Puzzle 4",
      difficulty: "very-hard",
      crowdedness: 26,
      code: "T: 06a6fc539 a95005005 00000006c c6f5393c0 56a53c3c5 0556f9390 c6c3f903c 6fc555539 003000000 F: - X: -"
    },
    {
      title: "Puzzle 5",
      difficulty: "very-hard",
      crowdedness: 32,
      code: "T: 06aafc039 3c66f953c c6c393000 505969690 c003c0c3a 3c36fc393 0006c6539 c00506505 56c395aa9 F: - X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "very-hard",
      crowdedness: 43,
      code: "T: ac003a06c 6c55393ac 56f3936aa c6a55053c c3c5053a9 6aa3c003c c55f95969 56a53c3a9 6c5939000 F: - X: -"
    }
  ];
})();
