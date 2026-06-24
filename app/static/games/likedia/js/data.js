/**
 * diaLike - Game Data Tables
 * Constants, item tables, skill definitions, class definitions, and pure
 * helper functions extracted from the monolithic controller.
 */

// ==========================================
// 8. MAIN GAME CONSTANTS & DATA
// ==========================================
const SPAWN_INTERVAL = 180;
const MAX_MONSTERS = 10;
const ITEM_POOL = [
    { name: '철제 검', type: 'weapon', slot: 'weapon', stat: '+5 공격력', value: 5, speed: 1.0, rarity: 'normal', color: '#b0a89f', reqLevel: 1 },
    { name: '룬 단검', type: 'weapon', slot: 'weapon', stat: '+12 공격력', value: 12, speed: 0.8, rarity: 'normal', color: '#b0a89f', reqLevel: 1 },
    { name: '디아블로의 낫', type: 'weapon', slot: 'weapon', stat: '+30 공격력', value: 30, speed: 1.2, rarity: 'unique', color: '#ff5500', reqLevel: 15 },
    { name: '가죽 방패', type: 'armor', slot: 'shield', stat: '+10 최대 HP', value: 10, rarity: 'normal', color: '#b0a89f', reqLevel: 1 },
    { name: '성기사의 방패', type: 'armor', slot: 'shield', stat: '+40 최대 HP', value: 40, rarity: 'unique', color: '#ff5500', reqLevel: 12 },
    { name: '강철 투구', type: 'armor', slot: 'helmet', stat: '+25 최대 HP', value: 25, rarity: 'normal', color: '#b0a89f', reqLevel: 1 },
    { name: '가죽 갑옷', type: 'armor', slot: 'chest', stat: '+15 최대 HP', value: 15, rarity: 'normal', color: '#b0a89f', reqLevel: 1 },
    { name: '대천사의 로브', type: 'armor', slot: 'chest', stat: '+50 최대 MP', value: 50, rarity: 'unique', color: '#ff5500', reqLevel: 18 },
    { name: '체력 물약', type: 'potion', slot: 'potion', stat: '사용 시 체력 35% 회복', value: 35, rarity: 'normal', color: '#00ff00', reqLevel: 1 },
    { name: '마나 물약', type: 'potion', slot: 'potion', subtype: 'mana', stat: '사용 시 마나 50% 회복', value: 50, rarity: 'normal', color: '#3a8fff', reqLevel: 1 }
];

const SHOP_ITEMS = [
    { name: '소형 체력 물약', value: 25, basePrice: 15 },
    { name: '하급 체력 물약', value: 35, basePrice: 30 },
    { name: '일반 체력 물약', value: 50, basePrice: 60 },
    { name: '대형 체력 물약', value: 70, basePrice: 125 },
    { name: '하급 마나 물약', value: 40, basePrice: 25, subtype: 'mana' },
    { name: '일반 마나 물약', value: 70, basePrice: 60, subtype: 'mana' }
];
const GAMBLE_BASE_PRICE = 150;

function shopPriceFor(basePrice, playerLevel) {
    return Math.floor(basePrice * (1 + 0.25 * (playerLevel - 1)));
}

const PREFIXES = [
    { name: '날카로운', slot: 'weapon', value: 3 },
    { name: '치명적인', slot: 'weapon', value: 6 },
    { name: '단단한', slot: 'shield|helmet|chest', value: 4 },
    { name: '두꺼운', slot: 'shield|helmet|chest', value: 8 },
    { name: '빛나는', slot: 'weapon|shield|helmet|chest', value: 5 },
    { name: '축복받은', slot: 'weapon|shield|helmet|chest', value: 10 },
    { name: '신성한', slot: 'weapon|shield|helmet|chest', value: 15 }
];

const SUFFIXES = [
    { name: '의 분노', slot: 'weapon', value: 4, statType: 'ATK' },
    { name: '의 파괴자', slot: 'weapon', value: 10, statType: 'ATK' },
    { name: '의 수호', slot: 'shield|helmet|chest', value: 5, statType: 'HP' },
    { name: '의 생명', slot: 'shield|helmet|chest', value: 12, statType: 'HP' },
    { name: '의 마나', slot: 'helmet|chest', value: 10, statType: 'MP' },
    { name: '의 힘', slot: 'weapon|shield|helmet|chest', value: 6, statType: 'HP' },
    { name: '의 마법사', slot: 'weapon|helmet|chest', value: 1, statType: 'SKILL_FIREBALL' }
];

const GEM_TYPES = [
    { name: '루비', color: '#ff4466', effect: { hp: 25 }, stat: '소켓 장착 시: +25 최대 HP' },
    { name: '사파이어', color: '#3a8fff', effect: { mp: 20 }, stat: '소켓 장착 시: +20 최대 MP' },
    { name: '에메랄드', color: '#2ecc71', effect: { atk: 5 }, stat: '소켓 장착 시: +5 공격력' }
];

const BOSS_FLOOR_INTERVAL = 3;

const SKILLS = {
    fireball:  { name: '화염구', icon: '🔥', kind: 'projectile', damageType: 'fire',
                 baseMult: 1.8, multPerLevel: 0.4, baseCost: 15, costPerLevel: 2.5,
                 maxLevel: 20, color: '#ff4500', splash: 40 },
    frostbolt: { name: '냉기 화살', icon: '❄', kind: 'projectile', damageType: 'cold',
                 baseMult: 1.3, multPerLevel: 0.28, baseCost: 12, costPerLevel: 2,
                 maxLevel: 20, color: '#5bc8ff', slow: 110 },
    chain:     { name: '연쇄 번개', icon: '⚡', kind: 'chain', damageType: 'lightning',
                 baseMult: 1.4, multPerLevel: 0.30, baseCost: 18, costPerLevel: 3,
                 maxLevel: 20, color: '#b98bff', jumps: 3, jumpRange: 170 },
    whirlwind: { name: '회전 베기', icon: '🌀', kind: 'melee_aoe', damageType: 'physical',
                 baseMult: 1.1, multPerLevel: 0.22, baseCost: 14, costPerLevel: 2,
                 maxLevel: 20, color: '#ffe6b4', radius: 90 }
};
function skillMult(key, lvl) { const s = SKILLS[key]; return s.baseMult + (lvl - 1) * s.multPerLevel; }
function skillCost(key, lvl) { const s = SKILLS[key]; return Math.round(s.baseCost + (lvl - 1) * s.costPerLevel); }

const CLASSES = {
    warrior: {
        name: '전사', icon: '⚔', color: '#d9534f',
        desc: '높은 체력과 근접 전투. 회전 베기로 적을 쓸어버린다.',
        baseAtk: 18, baseMaxHp: 140, baseMaxMp: 30,
        critChance: 0.08, critMultiplier: 1.9, attackDuration: 18,
        skillAccess: ['whirlwind', 'fireball'], startSkill: { whirlwind: 1 }, activeSkill: 'whirlwind'
    }
};
