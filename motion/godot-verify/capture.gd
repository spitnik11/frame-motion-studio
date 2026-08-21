extends Node2D
func _ready():
    RenderingServer.set_default_clear_color(Color(1,0,1,1)) # magenta = proves transparency
    var sf = load("res://idle.tres")
    for i in sf.get_frame_count("idle"):
        var s = Sprite2D.new()
        s.texture = sf.get_frame_texture("idle", i)
        s.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
        s.centered = false
        s.position = Vector2(i*72 + 2, 8)
        add_child(s)
    # also an actually-playing AnimatedSprite2D to prove playback works
    var asp = AnimatedSprite2D.new()
    asp.sprite_frames = sf
    asp.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    asp.centered = false
    asp.position = Vector2(600, 8)
    add_child(asp)
    asp.play("idle")
    await RenderingServer.frame_post_draw
    await get_tree().process_frame
    await RenderingServer.frame_post_draw
    var img = get_viewport().get_texture().get_image()
    img.save_png(ProjectSettings.globalize_path("res://render_out.png"))
    print("captured ", img.get_size(), " playing=", asp.is_playing(), " cur_anim=", asp.animation, " frame=", asp.frame)
    get_tree().quit()
