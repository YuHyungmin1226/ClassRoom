"""ClassGame 설정.

ClassQuiz 등에서 모은 포인트(StudentPoint)를 사용해 즐기는 게임 모음.
각 게임은 정적(static) 자원으로 번들되어 Flask가 직접 서빙한다.
"""

GAMES = {
    'likedia': {
        'name': 'LikeDIA',
        'desc': '디아블로 스타일 액션 RPG. 몬스터를 처치하고 장비를 파밍하세요.',
        'icon': '⚔️',
        'cost': 1,        # 1회 플레이에 필요한 포인트
        'dir': 'likedia',  # app/protected_games 아래 폴더명(직접 접근 불가, 결제 검증 후 서빙)
    },
}


def is_valid_game(game_id):
    return game_id in GAMES
