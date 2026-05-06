REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_has_location(UUID, TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_user_locations() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_location(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_locations() TO authenticated;
