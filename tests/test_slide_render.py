"""Slide previews: PowerPoint first, LibreOffice as a fallback, never closing the user's PowerPoint."""
import contextlib
from pathlib import Path

import pytest

from core.features.documents import slide_render


class FakeSlide:
    def __init__(self, log):
        self.log = log

    def Export(self, path, fmt, width, height):
        self.log.append(('export', path, fmt, width, height))
        Path(path).write_bytes(b'jpg')


class FakeSlides:
    def __init__(self, app):
        self.app = app

    @property
    def Count(self):
        return self.app.slide_count

    def Item(self, number):
        if number == self.app.fail_at:
            raise RuntimeError('export failed')
        return FakeSlide(self.app.log)


class FakePageSetup:
    SlideWidth = 960.0
    SlideHeight = 540.0


class FakePresentation:
    def __init__(self, app):
        self.app = app
        self.PageSetup = FakePageSetup()
        self.Slides = FakeSlides(app)

    def Close(self):
        self.app.log.append(('close',))
        self.app.open_count -= 1


class FakePresentations:
    def __init__(self, app):
        self.app = app

    @property
    def Count(self):
        return self.app.open_count

    def Open(self, path, read_only, untitled, with_window):
        self.app.log.append(('open', path, read_only, untitled, with_window))
        self.app.open_count += 1
        return FakePresentation(self.app)


class FakePowerPoint:
    def __init__(self, slide_count=3, already_open=0, fail_at=None):
        self.log = []
        self.open_count = already_open
        self.slide_count = slide_count
        self.fail_at = fail_at
        self.quit = False
        self.Presentations = FakePresentations(self)

    def Quit(self):
        self.quit = True


@pytest.fixture
def powerpoint(monkeypatch):
    def install(app, started):
        monkeypatch.setattr(slide_render, '_open_powerpoint', lambda: (app, started))
        monkeypatch.setattr(slide_render, '_com_apartment', contextlib.nullcontext)
        monkeypatch.setattr(slide_render, 'powerpoint_available', lambda: True)
        return app
    return install


def test_powerpoint_exports_numbered_jpgs(tmp_path, powerpoint):
    app = powerpoint(FakePowerPoint(slide_count=3), started=True)
    deck = str(tmp_path / 'deck.pptx')
    images = slide_render.render_with_powerpoint(deck, str(tmp_path / 'out'))
    assert [Path(p).name for p in images] == ['slide-001.jpg', 'slide-002.jpg', 'slide-003.jpg']
    assert app.log[0] == ('open', deck, -1, 0, 0)
    assert [entry[2:] for entry in app.log if entry[0] == 'export'] == [('JPG', 1280, 720)] * 3


def test_powerpoint_quits_only_when_it_started_it(tmp_path, powerpoint):
    app = powerpoint(FakePowerPoint(), started=True)
    slide_render.render_with_powerpoint(str(tmp_path / 'deck.pptx'), str(tmp_path / 'out'))
    assert app.quit is True


def test_powerpoint_left_running_when_it_was_already_open(tmp_path, powerpoint):
    app = powerpoint(FakePowerPoint(already_open=1), started=False)
    slide_render.render_with_powerpoint(str(tmp_path / 'deck.pptx'), str(tmp_path / 'out'))
    assert app.quit is False and app.open_count == 1


def test_presentation_closed_when_export_fails(tmp_path, powerpoint):
    app = powerpoint(FakePowerPoint(fail_at=2), started=True)
    with pytest.raises(RuntimeError):
        slide_render.render_with_powerpoint(str(tmp_path / 'deck.pptx'), str(tmp_path / 'out'))
    assert ('close',) in app.log and app.quit is True


def test_powerpoint_failure_falls_back_to_libreoffice(tmp_path, monkeypatch, powerpoint):
    powerpoint(FakePowerPoint(fail_at=1), started=True)
    monkeypatch.setattr(slide_render, '_SOFFICE_BIN', 'soffice')
    monkeypatch.setattr(slide_render, '_PDFTOPPM_BIN', 'pdftoppm')
    monkeypatch.setattr(slide_render, '_render_with_libreoffice', lambda *args: ['slide-01.jpg'])
    assert slide_render.render_slide_images(str(tmp_path / 'deck.pptx'), str(tmp_path / 'out')) == ['slide-01.jpg']


def test_falls_back_to_libreoffice_when_powerpoint_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(slide_render, 'powerpoint_available', lambda: False)
    monkeypatch.setattr(slide_render, '_SOFFICE_BIN', 'soffice')
    monkeypatch.setattr(slide_render, '_PDFTOPPM_BIN', 'pdftoppm')
    monkeypatch.setattr(slide_render, '_render_with_libreoffice', lambda *args: ['slide-01.jpg'])
    assert slide_render.render_slide_images('deck.pptx', str(tmp_path)) == ['slide-01.jpg']


def test_nothing_installed_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(slide_render, 'powerpoint_available', lambda: False)
    monkeypatch.setattr(slide_render, '_SOFFICE_BIN', None)
    monkeypatch.setattr(slide_render, '_PDFTOPPM_BIN', None)
    assert slide_render.render_slide_images('deck.pptx', str(tmp_path)) == []
