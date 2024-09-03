const fs = require('fs');

class Team {
  constructor(name, ranking) {
    this.name = name;
    this.ranking = ranking;
    this.wins = 0;
    this.losses = 0;
    this.points = 0;
    this.scored = 0;
    this.conceded = 0;
  }

  updateScores(scored, conceded) {
    this.scored += scored;
    this.conceded += conceded;
  }

  updatePoints(points) {
    this.points += points;
    if (points === Tournament.WIN_POINTS) {
      this.wins += 1;
    } else {
      this.losses += 1;
    }
  }

  get goalDifference() {
    return this.scored - this.conceded;
  }
}

class Tournament {
  static WIN_POINTS = 2;
  static LOSS_POINTS = 1;
  static TEAM_RANK_LIMIT = 8;

  constructor(teamsMap) {
    this.teamsMap = teamsMap;
    this.exhibitions = this.loadData('exibitions.json');
    this.groups = this.loadData('groups.json');
    this.teamForms = this.calculateCumulativeForm();
    this.groupStageMatches = {};
    this.knockoutResults = {};
  }

  loadData(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error('Error loading or parsing JSON:', err);
      process.exit(1);
    }
  }

  calculateCumulativeForm() {
    const teamForms = {};

    for (const [team, matches] of Object.entries(this.exhibitions)) {
      if (!Array.isArray(matches)) {
        console.error(`Incorrect data format for team ${team}. Expected an array.`);
        continue;
      }

      let cumulativeDifference = 0;

      matches.forEach(match => {
        const opponent = this.teamsMap[match.Opponent] || match.Opponent;
        const [teamGoals, opponentGoals] = match.Result.split('-').map(Number);
        const difference = teamGoals - opponentGoals;
        cumulativeDifference += difference;
      });

      teamForms[team] = cumulativeDifference;
    }

    return teamForms;
  }

  simulateTournament() {
    console.log("Friendly Matches:");
    this.displayFriendlyMatches();

    const groupResults = this.simulateGroupStages();
    const rankedTeams = this.rankTeamsForKnockout(groupResults);
    const knockoutDraw = this.drawKnockoutStage(rankedTeams);
    this.knockoutResults = this.simulateKnockoutStage(knockoutDraw);

    this.displayEliminationResults();
  }

  displayFriendlyMatches() {
    for (const [team, matches] of Object.entries(this.exhibitions)) {
      console.log(`${this.teamsMap[team]}:`);
      matches.forEach(match => {
        const opponent = this.teamsMap[match.Opponent] || match.Opponent;
        console.log(`    ${this.teamsMap[team]} - ${opponent} (${match.Result})`);
      });
    }
    console.log();
  }

  simulateGroupStages() {
    const groupResults = {};

    for (const groupName in this.groups) {
      const teams = this.groups[groupName].map(team => new Team(team.Team, team.FIBARanking));
      const groupStageResults = this.playGroupStage(teams);
      groupResults[groupName] = groupStageResults;
      this.displayGroupStageResults(groupName, groupStageResults);
    }

    return groupResults;
  }

  playGroupStage(teams) {
    const results = teams.map(team => new Team(team.name, team.ranking));

    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const team1 = results[i];
        const team2 = results[j];
        const [team1Score, team2Score] = this.simulateGamePoisson(team1.ranking, team2.ranking);

        this.displayMatchResult(team1.name, team2.name, team1Score, team2Score);
        this.updateMatchResults(team1, team2, team1Score, team2Score);
        this.recordGroupStageMatch(team1.name, team2.name);
      }
    }

    return this.sortTeamsByPerformance(results);
  }

  recordGroupStageMatch(team1, team2) {
    if (!this.groupStageMatches[team1]) {
      this.groupStageMatches[team1] = new Set();
    }
    if (!this.groupStageMatches[team2]) {
      this.groupStageMatches[team2] = new Set();
    }
    this.groupStageMatches[team1].add(team2);
    this.groupStageMatches[team2].add(team1);
  }

  simulateGamePoisson(ranking1, ranking2, form1 = 0, form2 = 0) {
    const lambda1 = this.calculateExpectedPoints(ranking1, ranking2) + form1;
    const lambda2 = this.calculateExpectedPoints(ranking2, ranking1) + form2;
    const score1 = this.generatePoissonScore(lambda1);
    const score2 = this.generatePoissonScore(lambda2);
    return [score1, score2];
  }

  calculateExpectedPoints(teamRanking, opponentRanking) {
    const basePoints = 80;
    const rankingDifferenceFactor = 0.1;
    const rankingDifference = opponentRanking - teamRanking;
    return basePoints + rankingDifference * rankingDifferenceFactor;
  }

  generatePoissonScore(lambda) {
    let L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    return k - 1;
  }

  updateMatchResults(team1, team2, score1, score2) {
    team1.updateScores(score1, score2);
    team2.updateScores(score2, score1);

    if (score1 > score2) {
      team1.updatePoints(Tournament.WIN_POINTS);
      team2.updatePoints(Tournament.LOSS_POINTS);
    } else if (score2 > score1) {
      team2.updatePoints(Tournament.WIN_POINTS);
      team1.updatePoints(Tournament.LOSS_POINTS);
    }
  }

  sortTeamsByPerformance(results) {
    return results.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.scored - a.scored);
  }

  displayMatchResult(team1, team2, score1, score2) {
    console.log(`    ${team1} - ${team2} (${score1}:${score2})`);
  }

  displayGroupStageResults(groupName, results) {
    console.log(`Final standings for group ${groupName}:`);
    results.forEach((team, index) => {
      console.log(`    ${index + 1}. ${team.name} ${team.wins} / ${team.losses} / ${team.points} / ${team.scored} / ${team.conceded} / ${team.goalDifference}`);
    });
    console.log();
  }

  rankTeamsForKnockout(groupResults) {
    const allTeams = Object.values(groupResults).flat();
    return allTeams.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.scored - a.scored)
                   .slice(0, Tournament.TEAM_RANK_LIMIT);
  }

  drawKnockoutStage(rankedTeams) {
    const hats = {
        D: [rankedTeams[0], rankedTeams[1]],
        E: [rankedTeams[2], rankedTeams[3]],
        F: [rankedTeams[4], rankedTeams[5]],
        G: [rankedTeams[6], rankedTeams[7]]
    };

    const quarterFinals = [];
    const usedTeams = new Set();

    
    const isMatchAlreadyPlayed = (team1, team2) => {
        return this.groupStageMatches[team1.name]?.has(team2.name);
    };

   
    const findOpponent = (team, hat2) => {
        for (const opponent of hats[hat2]) {
            if (!isMatchAlreadyPlayed(team, opponent) && !usedTeams.has(opponent.name)) {
                return opponent;
            }
        }
        return null;
    };

    
    const tryPairing = () => {
        for (const team1 of hats.D) {
            const opponent = findOpponent(team1, 'G');
            if (opponent) {
                quarterFinals.push([team1, opponent]);
                usedTeams.add(team1.name);
                usedTeams.add(opponent.name);
            }
        }

        for (const team1 of hats.E) {
            const opponent = findOpponent(team1, 'F');
            if (opponent) {
                quarterFinals.push([team1, opponent]);
                usedTeams.add(team1.name);
                usedTeams.add(opponent.name);
            }
        }

      
        return quarterFinals.length === 4;
    };

    
    const reorderTeams = (hat) => {
        const firstTeam = hats[hat].shift();
        hats[hat].push(firstTeam);
    };

  
    while (!tryPairing()) {
    
        quarterFinals.length = 0;
        usedTeams.clear();

      
        reorderTeams('G');
        reorderTeams('F');
    }

   
    console.log("Četvrtfinalni mečevi:");
    quarterFinals.forEach(([team1, team2], index) => {
        console.log(`Match ${index + 1}: ${team1.name} vs ${team2.name}`);
    });

    this.displayHatsAndDraw(hats, quarterFinals);
    return quarterFinals;
}



  displayHatsAndDraw(hats, quarterFinals) {
    console.log("Drawing results for knockout stage:");
    console.log("Hats:");
    for (const [hat, teams] of Object.entries(hats)) {
      console.log(`  ${hat}: ${teams.map(team => team.name).join(', ')}`);
    }

    console.log("\nQuarter-finals:");
    quarterFinals.forEach(([team1, team2], index) => {
      console.log(`  Match ${index + 1}: ${team1.name} vs ${team2.name}`);
    });
    console.log();
  }

  simulateKnockoutStage(quarterFinals) {
    const semiFinals = [];
    const finals = [];

    quarterFinals.forEach(([team1, team2]) => {
      const [score1, score2] = this.simulateGamePoisson(team1.ranking, team2.ranking, this.teamForms[team1.name], this.teamForms[team2.name]);
      this.displayMatchResult(team1.name, team2.name, score1, score2);

      const winner = score1 > score2 ? team1 : team2;
      const loser = score1 < score2 ? team1 : team2;

      if (score1 === score2) {
        console.log("    Match ended in a draw. Penalty shootout needed.");
        const [penaltyScore1, penaltyScore2] = this.simulatePenaltyShootout();
        if (penaltyScore1 > penaltyScore2) {
          console.log(`    ${team1.name} wins in penalties (${penaltyScore1}:${penaltyScore2})`);
          semiFinals.push(team1);
        } else {
          console.log(`    ${team2.name} wins in penalties (${penaltyScore2}:${penaltyScore1})`);
          semiFinals.push(team2);
        }
      } else {
        semiFinals.push(winner);
      }
    });

    console.log("\nSemi-finals:");
    semiFinals.forEach(team => console.log(`  ${team.name}`));

    while (semiFinals.length > 1) {
      const [team1, team2] = semiFinals.splice(0, 2);
      const [score1, score2] = this.simulateGamePoisson(team1.ranking, team2.ranking, this.teamForms[team1.name], this.teamForms[team2.name]);
      this.displayMatchResult(team1.name, team2.name, score1, score2);

      const winner = score1 > score2 ? team1 : team2;
      const loser = score1 < score2 ? team1 : team2;

      if (score1 === score2) {
        console.log("    Match ended in a draw. Penalty shootout needed.");
        const [penaltyScore1, penaltyScore2] = this.simulatePenaltyShootout();
        if (penaltyScore1 > penaltyScore2) {
          console.log(`    ${team1.name} wins in penalties (${penaltyScore1}:${penaltyScore2})`);
          finals.push(team1);
        } else {
          console.log(`    ${team2.name} wins in penalties (${penaltyScore2}:${penaltyScore1})`);
          finals.push(team2);
        }
      } else {
        finals.push(winner);
      }
    }

    console.log("\nFinal:");
    const [finalist1, finalist2] = finals;
    const [finalScore1, finalScore2] = this.simulateGamePoisson(finalist1.ranking, finalist2.ranking, this.teamForms[finalist1.name], this.teamForms[finalist2.name]);
    this.displayMatchResult(finalist1.name, finalist2.name, finalScore1, finalScore2);

    const champion = finalScore1 > finalScore2 ? finalist1 : finalist2;
    const runnerUp = finalScore1 < finalScore2 ? finalist1 : finalist2;
    console.log(`\nChampion: ${champion.name}`);
    console.log(`Runner-up: ${runnerUp.name}`);

    return { champion, runnerUp };
  }

  simulatePenaltyShootout() {
    const team1Score = Math.floor(Math.random() * 5);
    const team2Score = Math.floor(Math.random() * 5);
    return [team1Score, team2Score];
  }

  displayEliminationResults() {
    const thirdPlace = this.knockoutResults.runnerUp;
    console.log(`\nMatch for third place: ${thirdPlace.name}`);
    console.log(`Third place: ${thirdPlace.name}`);
  }
}

const teamsMap = {
    CAN: 'Canada',
    AUS: 'Australia',
    GRE: 'Greece',
    ESP: 'Spain',
    GER: 'Germany',
    FRA: 'France',
    BRA: 'Brazil',
    JPN: 'Japan',
    USA: 'United States',
    SRB: 'Serbia',
    SSD: 'South Sudan',
    PRI: 'Puerto Rico',
    POR: 'Portugal'
};

const tournament = new Tournament(teamsMap);
tournament.simulateTournament();
