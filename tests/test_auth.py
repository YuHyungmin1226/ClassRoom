def test_admin_pages_redirect_when_anonymous(client):
    for url in ['/admin/dashboard', '/admin/settings', '/admin/quiz', '/admin/classroom', '/admin/class/x']:
        assert client.get(url).status_code == 302


def test_admin_api_401_when_anonymous(client):
    assert client.post('/admin/create_class', data={'name': 'x'}).status_code == 401
    assert client.post('/admin/grant_points', json={'amount': 1}).status_code == 401
    assert client.post('/admin/quiz/math/1/import').status_code == 401


def test_admin_access_when_logged_in(admin_client):
    for url in ['/admin/dashboard', '/admin/settings', '/admin/quiz']:
        assert admin_client.get(url).status_code == 200


def test_public_pages_open(client):
    for url in ['/', '/quiz', '/quiz/math/1', '/game', '/game/likedia']:
        assert client.get(url).status_code == 200
