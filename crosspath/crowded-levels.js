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
      crowdedness: 14,
      code: "T: 005003aac 005ac3a90 500500500 569f90500 00006a03c 06caff695 5055033aa 500fac3a9 500500506 F: 5@2 6@3 X: N1 E2"
    },
    {
      title: "Puzzle 4",
      difficulty: "easy",
      crowdedness: 26,
      code: "T: 56c553550 50056c955 53f5053a9 556555555 055af9c50 90506f053 550f90900 6c0f90506 a906aa3aa F: 2@3 3@7 X: -"
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
      crowdedness: 40,
      code: "T: 00000006a 056693506 c56ff9956 96c695969 6ac3c5af9 6fc539900 03c6c5539 505569396 6f953c903 F: 5@2 6@9 X: N8 S3"
    },
    {
      title: "Puzzle 1",
      difficulty: "medium",
      crowdedness: 4,
      code: "T: 000c06505 050afa050 000000ac0 0006aa500 003000000 faf905aa9 3aa06a03a c003ac003 a90000000 F: - X: N3 E5"
    },
    {
      title: "Puzzle 2",
      difficulty: "medium",
      crowdedness: 7,
      code: "T: 6ac505fa9 000000aaa 900000000 0000006aa 53c905069 069a96aa9 00006a03a 000000006 500500fc0 F: - X: W4 S8"
    },
    {
      title: "Puzzle 3",
      difficulty: "medium",
      crowdedness: 12,
      code: "T: 53a900000 aac005c69 03c005003 5003aa000 000000aaa 93c005069 6903acaa9 00006a050 003aac6c3 F: 8@4 6@6 X: -"
    },
    {
      title: "Puzzle 4",
      difficulty: "medium",
      crowdedness: 21,
      code: "T: 3af06903a 500900000 06ca93000 aac005003 00006a6fc 000ac0a90 93c6c393a 5553ff695 006c69550 F: - X: N7 E6"
    },
    {
      title: "Puzzle 5",
      difficulty: "medium",
      crowdedness: 33,
      code: "T: 3f96fa3fc 390ac6039 9006c093c 6aa3acc6f 5003c003c 69596f039 6a95063a9 6c59556f9 00006c693 F: - X: N7 E8"
    },
    {
      title: "Puzzle 6",
      difficulty: "medium",
      crowdedness: 44,
      code: "T: 955c53f90 695969c3c 3a9ac0690 3acac5039 56a53a3c6 06c6f953a 6c03fac56 3c06fa390 695569390 F: 6@1 3@6 X: -"
    },
    {
      title: "Puzzle 1",
      difficulty: "hard",
      crowdedness: 4,
      code: "T: 5053a9000 ac56f953c 050050050 050050a90 06a690500 005005003 000000aaa 00000006a 5005003ac F: 5@1 X: -"
    },
    {
      title: "Puzzle 2",
      difficulty: "hard",
      crowdedness: 7,
      code: "T: 039000000 050050afc 5005003c6 a95005aa9 aac003000 6aa3c0050 000000c00 00006c055 6ff395003 F: 4@9 X: -"
    },
    {
      title: "Puzzle 3",
      difficulty: "hard",
      crowdedness: 16,
      code: "T: 900000000 af96fc939 500500500 05305003a 00500306c 000aacaaf 0056af503 000000aac 6a9fac3c5 F: 4@8 X: -"
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
      crowdedness: 34,
      code: "T: 03a6aafaa 3c56f953a 000ac0050 06c03f069 fac905aa9 55055053c c3cfc5955 6953c5039 3c605303a F: - X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "hard",
      crowdedness: 40,
      code: "T: 539900ac0 6c53f96fc c6c555395 5553f9050 6c6939aac 06c6933aa 6aa50056c ac5055039 6ac5033aa F: 6@8 X: -"
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
      crowdedness: 5,
      code: "T: c00900aaa 000c00900 000000ac0 05503faaf 050050050 050050a90 6aa50696f 005003000 000c003aa F: - X: -"
    },
    {
      title: "Puzzle 3",
      difficulty: "very-hard",
      crowdedness: 15,
      code: "T: 3c5055039 06c695505 395c053a9 000ac0050 6fa55053c 905005005 6c03fa050 69056c555 003000000 F: - X: -"
    },
    {
      title: "Puzzle 4",
      difficulty: "very-hard",
      crowdedness: 27,
      code: "T: 6aa96a056 6ff393aaa c0096ca95 50056c553 006003000 53c5053a9 c03900aac aa9ac0690 6ac503500 F: - X: -"
    },
    {
      title: "Puzzle 5",
      difficulty: "very-hard",
      crowdedness: 31,
      code: "T: 039000000 6c65533fa c3a96ca93 6aa96a03a 6963c5039 c00500900 ac6c39900 c005003c0 c005003c6 F: - X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "very-hard",
      crowdedness: 40,
      code: "T: 6c33fca95 aacc053a9 aa906aa96 06caf9a90 5393ac003 6aa500500 3c669556f aac6a93aa c6a556395 F: - X: -"
    }
  ];
})();
