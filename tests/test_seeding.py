import pytest
from app import db
from app.models import SubjectQuestion
from app.seeding import seed_curated, seed_generated, seed_if_empty, AUTO_TAG

def test_seed_curated(app):
    # conftest에서 적재한 레거시 데이터를 모두 삭제하여 격리 상태 확인
    SubjectQuestion.query.delete()
    db.session.commit()
    
    # 큐레이션 적재 실행
    total_loaded = seed_curated()
    assert total_loaded > 0
    
    # DB에 들어간 문항 수 검증 (AUTO 태그가 없는 순수 큐레이션 문제 확인)
    curated_count = SubjectQuestion.query.filter(
        (SubjectQuestion.standard_code != AUTO_TAG) | (SubjectQuestion.standard_code == None)
    ).count()
    assert curated_count == total_loaded

def test_seed_generated(app):
    # 큐레이션 및 레거시 데이터는 그대로 둔 채 자동 생성만 실행
    # (과목, 학년)별 5개씩만 적제하도록 n_override 설정
    total_loaded = seed_generated(n_override=5)
    
    # 5과목 * 3학년 * 5개 = 75개 문항 생성
    assert total_loaded == 75
    
    # AUTO 태그가 달린 문항 수 검증
    auto_count = SubjectQuestion.query.filter_by(standard_code=AUTO_TAG).count()
    assert auto_count == 75

def test_seed_if_empty(app):
    # 1. 이미 DB에 데이터가 존재할 때 (conftest에서 시드한 math 35문제 존재)
    # seed_if_empty는 데이터가 있으므로 False를 리턴해야 함
    assert seed_if_empty() is False
    
    # 2. DB 데이터를 완전히 비웠을 때
    SubjectQuestion.query.delete()
    db.session.commit()
    assert SubjectQuestion.query.count() == 0
    
    # seed_if_empty는 True를 리턴하고 기본 문제셋을 채워야 함
    # (테스트 속도를 위해 math는 270개, 나머지는 DEFAULT_N=1000개이므로
    #  전체 생성에는 약간의 시간이 소요될 수 있으나 임시 SQLite DB에서 정상 작동함)
    assert seed_if_empty() is True
    
    # 문제들이 최소 1개 이상 들어갔는지 검증
    count = SubjectQuestion.query.count()
    assert count > 0
