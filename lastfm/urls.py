from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("api/recent-tracks", views.recent_tracks, name="recent_tracks"),
]
