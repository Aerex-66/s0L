def test_preferences_default_to_my_deals(tmp_store):
    assert tmp_store.get('/api/preferences').get_json() == {'solutioner': '', 'scope': 'mine'}


def test_preferences_are_saved(tmp_store):
    response = tmp_store.put('/api/preferences', json={'solutioner': '  Pat Lee ', 'scope': 'everyone'})
    assert response.get_json() == {'solutioner': 'Pat Lee', 'scope': 'everyone'}
    assert tmp_store.get('/api/preferences').get_json() == {'solutioner': 'Pat Lee', 'scope': 'everyone'}


def test_partial_update_keeps_the_rest(tmp_store):
    tmp_store.put('/api/preferences', json={'solutioner': 'Pat Lee'})
    tmp_store.put('/api/preferences', json={'scope': 'everyone'})
    assert tmp_store.get('/api/preferences').get_json() == {'solutioner': 'Pat Lee', 'scope': 'everyone'}


def test_bad_preferences_are_refused(tmp_store):
    assert tmp_store.put('/api/preferences', json={'scope': 'boss'}).status_code == 400
    assert tmp_store.put('/api/preferences', json={'theme': 'dark'}).status_code == 400
    assert tmp_store.put('/api/preferences', json=['mine']).status_code == 400
