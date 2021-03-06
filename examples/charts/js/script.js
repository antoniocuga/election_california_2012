$(document).ready(function(){
    var router;
    var config;
    var election;
    var statewide_contest_template = Handlebars.compile($("#statewide-contest-template").html());
    var district_contest_template = Handlebars.compile($("#district-contest-template").html());
    var county_results_template = Handlebars.compile($("#county-results-template").html());
    var result_row_template = Handlebars.compile($("#result-row-template").html());
    var result_table_template = Handlebars.compile($("#result-table-template").html());
    var proposition_results_template = Handlebars.compile($("#proposition-results-template").html());
    var proposition_row_template = Handlebars.compile($("#proposition-row-template").html());
    var REP = "#ff6666", DEM = "#6cceff", NO = "#800000", YES = "#4b8402";

    
    var presidential_view, ussenate_view, ushouse_view, casenate_view, caassembly_view, propositions_view;
    var county_map_view, assembly_map_view, ushouse_map_view, casenate_map_view;
    Handlebars.registerHelper('result_table_template', result_table_template);
    Handlebars.registerHelper('county_results_template', county_results_template);
    Handlebars.registerHelper('add_commas', addCommas);

    function scale_page(){
        return;
        var width = $(window).width();
        if (width > 725)
        {
            $('body').css('width', 725);
            return;
        }
        if (width < 725)
        {
            $('.button').css('width', '99px');
            $('#zoom').css({'width': '245px',
            'height' : '40px'});
            $('#map-canvas').css('width', '255px');
            $('#zoombox').css({
                'margin-left': '0px',
                'width' : '230px'});
            $('#map_and_zoom').css('width', '250px');
            $('body').css('width', '625');
        }

    }
    scale_page();

    function addCommas(nStr)
    {
        // Public domain code from http://www.mredkj.com/javascript/nfbasic.html
        nStr += '';
        var x = nStr.split('.');
        var x1 = x[0];
        var x2 = x.length > 1 ? '.' + x[1] : '';
        var rgx = /(\d+)(\d{3})/;
        while (rgx.test(x1)) {
            x1 = x1.replace(rgx, '$1' + ',' + '$2');
        }
        return x1 + x2;
    }
    var Config = Backbone.Model.extend({
        // body, contest, county
        
        codeAddress: function() {
              var address = $('#zoombox').val();
              var map = this.get("map");
              this.get("geocoder").geocode( { 'address': address}, function(results, status) {
                if (status == google.maps.GeocoderStatus.OK) {
                  map.setCenter(results[0].geometry.location);
                                    map.setZoom(7);
                                    marker = new google.maps.Marker({
                    map:map,
                    draggable:false,
                    animation: google.maps.Animation.DROP,
                    position: results[0].geometry.location
                  });
                } else {
                  alert("Couldn't relocate for the following reason: " + status);
                }
              });
        },
        redraw_features : function () {
            var cfg = this;
            var feature_sets = this.get("map_feature_sets");
            _.each(feature_sets, function(feature_set_name)
            {
                cfg.redraw_feature_set(feature_set_name);
            });
            
        },
        redraw_feature_set : function (feature_set_name) {
                var feature_set = this.get(feature_set_name);
                if (feature_set == "pending")
                {
                    return;
                }
                
                _.each(feature_set, function(feature)
                {
                    feature.redraw();

                });

        },

        defaults: {
            body : "",
            contest: 0,
            county: 0,
            timeval: "",
            showcounties: false,
            showassembly: false,
            showsenate: false,
            showushouse: false,
            map: typeof google != "undefined" ? new google.maps.Map(document.getElementById("map-canvas"), {
                center: new google.maps.LatLng(37.328, -119.6943), // near Sacramento
                zoom: 5,
                mapTypeId: google.maps.MapTypeId.ROADMAP,
                styles: map_styles,
                scrollwheel: false,
                streetViewControl: false,
                mapTypeControl: false
            }) : null,
            geocoder : new google.maps.Geocoder(),
            map_feature_sets: []

        }


    });

    var Election = Backbone.Collection.extend({
        // last_updated
        model: Body,
        parse_bodies: function(bodies){
            var the_election = this;
            _.each(bodies, function(body, name)
            {
                var election_body = election.find(function(b){return b.get("name") == name;});
                if (!election_body){
                    election_body = new Body({ name : name, title: body.title });
                    the_election.add(election_body);
                }
                election_body.parse_contests(body.contests);

            });

        }

    });

    var Body = Backbone.Model.extend({
        // Name - e.g. us.president
        // Contests
        //

        parse_contests : function(contests){
            var the_body = this;
            var the_contests = the_body.get("contests");
            if (!the_contests)
            {
                the_contests = new Contests();
            }

            _.each(contests, function (contest, name)
            {
                var newcontest = the_contests.find(function(c){return c.get("name") == name;});
                if (!newcontest)
                {
                    newcontest = new Contest();
                }
                newcontest.set({
                        name: name,
                        body: the_body,
                        longname: contest.longname,
                        geo: contest.geo,
                        precincts_total: contest.precincts.total,
                        precincts_reporting: contest.precincts.reporting,
                        measure_number: +contest.measure_number,
                        precincts_reporting_percent: Math.round(contest.precincts.reporting_percent)
                    });
                newcontest.parse_candidates(contest.candidates);
                if (_.has(contest, 'counties'))
                {
                    var counties = new Counties();
                    _.each(contest.counties, function (county, name)
                    {
                        var newcounty = new County({
                            name: name,
                            title: county.title,
                            geo: county.geo,
                            candidates: county_votes_to_candidates(county.votes, newcontest.get("candidates")),
                            precincts_total: county.precincts.total,
                            precincts_reporting: county.precincts.reporting,
                            precincts_reporting_percent: Math.round(county.precincts.reporting_percent)


                        });
                        counties.add(newcounty);



                    });
                    newcontest.set('counties', counties);
                }
                else
                {
                    newcontest.set('counties', null);
                }
                var candidates = newcontest.get("candidates");
                // Remove third-party candidates
                // Consolidating them as other

                if(_.isUndefined(contest.measure_number))
                {
                    candidates.remove(candidates.filter(function(cand){return cand.get("party") != 'Dem' && cand.get("party") != 'Rep' && cand.get("party") != '---';}));
                }
                the_contests.add(newcontest);
            });
            the_body.set("contests", the_contests);

        }

    });

    var Contest = Backbone.Model.extend({
        // Name 
        // Longname
        // Geo
        // Body
        // Candidates
        // Precincts_reporting
        // Precincts_total
        // Precincts_reporting_percent
        // measure_number
        parse_candidates : function(candidates){
            var the_contest = this;
            var the_candidates = new Candidates();
            _.each(candidates, function(candidate, id)
            {
                var new_candidate = new Candidate(candidate);
                the_candidates.add(candidate);

            });
            if(the_candidates.size() > 2)
            {
                // Add 'Other' sum for neither rep/dem
                // And discard individual third-party candidates
                // We could make exceptions if we hear of any important ones
                var other_candidate = create_other_candidate(the_candidates);
                if (other_candidate)
                {
                    the_candidates.add(other_candidate);
                }


                
            }
            

            the_contest.set('candidates', the_candidates);

        }
    });
    var Contests = Backbone.Collection.extend({
        model : Contest,
        comparator: function (contest) {
            return contest.get("measure_number");

        }

    });

    var County = Backbone.Model.extend({
        // id
        // title
        // geo
        // votes
        // Precincts_reporting
        // Precincts_total
        // Precincts_reporting_percent


    });

    var Counties = Backbone.Collection.extend({
        model : County
    });

    function create_other_candidate(candidates)
    {
            var other_candidate = 
                new Candidate({
                    name: "Other",
                    party: "---",
                    last_name: "",
                    ballot_name: "Other",
                    id: "other"
                });
            var total_votes = 0;
            var total_vote_percent = 0;
            candidates.each(function(candidate){
                var party = candidate.get("party");
                if(party != 'Dem' && party != 'Rep')
                {
                    total_votes += +candidate.get("votes");
                    total_vote_percent += parseFloat(candidate.get("vote_percent"));
                }
            });
            other_candidate.set({votes: total_votes, vote_percent: total_vote_percent.toFixed(1)});
            if(total_votes === 0)
            {
                return null;
            }
            return other_candidate;

    }
    function county_votes_to_candidates(votes, candidates)
    {
        var newcandidates = new Candidates(_.map(votes, function(vote, candidate_id)
        {
            var new_candidate = candidates.get(candidate_id).clone();
            new_candidate.set(vote); // Override vote data

            return new_candidate;

            

        }));

        if (newcandidates.size() > 2)
        {
            var othercandidate = create_other_candidate(newcandidates);
            if (othercandidate)
            {
                newcandidates.add(othercandidate);
            }
            return newcandidates.remove(candidates.filter(function(cand){return cand.get("party") != 'Dem' && cand.get("party") != 'Rep' && cand.get("party") != '---';}));
        }
        
        return newcandidates;


    }
    var Candidate = Backbone.Model.extend({
        // name
        // id
        // ballot_name
        // last_name
        // votes
        // party
        // vote_percent

    });

    var Candidates = Backbone.Collection.extend({
        model: Candidate,
        comparator: function(candidate)
        {
            // Sort them in decreasing order of vote percentage
            // With "other" candidates first
            if (candidate.get("name") == "Other")
            {
                return 1;
            }
            return -1 * candidate.get("vote_percent");

        }

    });

    var DistrictContestView = Backbone.View.extend({
        tagName: "div",
        id: "district-contest-results",
        base_render : function(view){
            var title = view.model.get("title");
            var district = config.get("contest") || 0;
            district = +district;
            var contest = view.model.get("contests").find(function(c){return c.get("geo").district == district;});

            if (_.isUndefined(contest))
            {
                $(this.el).html('<div id="mouseovernotice"><p>Mouse over a district to see results</p></div>');
                
            }
            else
            {
                var json = contest.toJSON();
                json.candidates = json.candidates.toJSON();
                json.body_title = title;
                $(this.el).html(district_contest_template(json));
            }


            $('#chart-canvas').html($(this.el)); 

        }

    });

    var AssemblyContestView = DistrictContestView.extend({
        render: function(district)
        {
            this.base_render(this);
            assembly_map_view.render(district);

        }

    });
    var USHouseContestView = DistrictContestView.extend({
        render: function(district)
        {
            this.base_render(this);
            ushouse_map_view.render(district);

        }

    });
    var CASenateContestView = DistrictContestView.extend({
        render: function(district)
        {
            this.base_render(this);
            casenate_map_view.render(district);

        }

    });

        
        

        
    var StatewideContestView = Backbone.View.extend({
        tagName: "div",
        id: "statewide-contest-results",
        render: function(county_name) {
            var json = this.model.toJSON();
            json.body_title = json.body.get("title");
            json.candidates = json.candidates.toJSON(); // Need this as object too

            if(!_.isUndefined(county_name))
            {
                var county_results = json.counties.where({title: county_name});
                if (county_results.length > 0)
                {
                   json.county_results = county_results.pop().toJSON();
                   json.county_results.candidates = json.county_results.candidates.toJSON();
                }

            }

            $(this.el).html(statewide_contest_template(json));
            $('#chart-canvas').html($(this.el)); 
            county_map_view.render(county_name);
            return this;
        }
    });

    var PropositionView = Backbone.View.extend({
        tagName: "div",
        className: "prop-row",
        events: {
            "click .prop_top_name" : "select",
            "click .hidebutton" : "unselect"

        },

        select: function(){
            config.set({contest: this.model.get("measure_number")}, {silent: true});
            config.redraw_feature_set("county_features");
            $('.propselected').removeClass('propselected');
            this.$el.addClass('propselected');
        },

        unselect: function (){
            config.set({contest: 0});
            config.redraw_feature_set("county_features");
            this.$el.removeClass('propselected');

        },


        render: function(county_change_only){
            // model should be a proposition
            var proposition = this.model.toJSON();
            this.model.view = this;
            proposition.selected = +config.get("contest") == this.model.get("measure_number") ? "selected" : "";
            $('.propselected').removeClass('propselected');
                
            // Always two candidates: yes and no
            proposition.candidates = proposition.candidates.toJSON();
            var total = proposition.candidates[0].votes + proposition.candidates[1].votes;
            proposition.candidates[0].vote_percent = (100 * proposition.candidates[0].votes / total).toFixed(1);
            proposition.candidates[1].vote_percent = (100 * proposition.candidates[1].votes / total).toFixed(1);

            // Use zero percents for consistency with state-reported zero county totals
            if (isNaN(proposition.candidates[0].vote_percent))
            {
                proposition.candidates[0].vote_percent = 0;
            }
            if (isNaN(proposition.candidates[1].vote_percent))
            {
                proposition.candidates[1].vote_percent = 0;
            }
                
            proposition.total_votes = total;

            var county = config.get("county");

            if (_.has(prop_descriptions, proposition.measure_number))
            {
                proposition.description = prop_descriptions[proposition.measure_number];
            }
            if (county){
                var county_results = proposition.counties.find(function(cty){return cty.get("title") == county;});
                proposition.county_results = county_results.toJSON();
                proposition.county_results.candidates = proposition.county_results.candidates.toJSON();
                proposition.county_results.total_votes = proposition.county_results.candidates[0].votes + proposition.county_results.candidates[1].votes;
                $(this.el).html(proposition_row_template(proposition));


            }

            $(this.el).html(proposition_row_template(proposition));

            if (!county_change_only)
            {
                $('#prop-table').append($(this.el));
            }
            this.delegateEvents();
            return this;
            




        }

    });

    var PropositionsView = Backbone.View.extend({
        tagName: "div",
        id: "proposition-contest-results",
        render: function(county_name) {
            var json = {};
            json.body_title = this.model.get("title");
            if (_.isUndefined(this.propositions))
            {
                this.propositions = this.model.get("contests");
                var proposition_views = this.proposition_views = [];
                this.propositions.each(function(proposition){
                    proposition_views.push(new PropositionView({model: proposition, id: 'prop-row-' + proposition.get("measure_number")}));
                    
                });
            }
                

            $(this.el).html(proposition_results_template());


            $('#chart-canvas').html($(this.el));
            _.invoke(this.proposition_views, 'render');
            county_map_view.render(county_name);

            
            

        }

    });

    function county_responsive_unselected_opts () {

        if (!config.get("showcounties"))
        {
            return {visible: false, fillOpacity: 0, strokeWidth:0 };
        }
        if (config.get("body") == "ca.propositions" && +config.get("contest") !== 0)
        {
            var proposition = +config.get("contest");

            var thecounty = this.id;
            var contest = election.find(function(b){return b.get("name") == "ca.propositions";}).get("contests").find(function(c){
                return +c.get("measure_number") == proposition;

            });

            var county = contest.get("counties").find(function(c){
                return c.get("title") == thecounty;
            });

            var yes = county.get("candidates").find(function(c){return c.get("ballot_name") == "Yes";}).get("vote_percent");
            var fill_color;

            if (yes > 50)
            {
                fill_color = YES;
            }
            else if (yes < 50 && yes > 0)
            {
                fill_color = NO;
            }
            else fill_color = "#999";

            return {fillColor: fill_color, fillOpacity: 0.7, visible: true};
        }

        // Red blue map

        else
        {
            var body = config.get("body");
            var contest = election.find(function(b){return b.get("name") == body;}).get("contests").first(); // Only one for these statewide offices
            var thecounty = this.id;
            var county = contest.get("counties").find(function(c){
                return c.get("title") == thecounty;
            });
            if (county.get("precincts_reporting_percent") < 10)
            {
                // Insufficent data -- color it grey
                return {fillColor: "#999", fillOpacity: 0.7, strokeWidth: 1,visible: true };
            }


            var dem = county.get("candidates").find(function(c){return c.get("party") == "Dem";});
            var rep = county.get("candidates").find(function(c){return c.get("party") == "Rep";});

            if (_.isUndefined(dem))
            {
                dem_percent = 0;
            }
            else
            {
                dem_percent = dem.get("vote_percent");
            }
            if (_.isUndefined(rep))
            {
                rep_percent = 0;
            }
            else
            {
                rep_percent = rep.get("vote_percent");
            }

            var fillColor;
            if (rep_percent > dem_percent)
            {
                fillColor = REP;
            }
            else if (dem_percent > rep_percent)
            {
                fillColor = DEM;
            }
            else fillColor = "#999";
                

            return {fillColor: fillColor, fillOpacity: 0.7, strokeWidth: 0,visible: true };
        }



    }
    function county_responsive_highlighted_opts () {
        return {visible: true, strokeWidth: 1, strokeColor: "black"};

    }
    function district_responsive_unselected_opts (poly, showflag) {
        if (!config.get(showflag))
        {
            return {visible: false, fillOpacity: 0, fillColor: "#ffffff"};
        }
        var body = config.get("body");
        var district_id = +poly.id;
        contest = election.find(function(b){return b.get("name") == body;}).get("contests").find(function(c){
            return c.get("geo").district == district_id;
        });

        if(_.isUndefined(contest))
        {
            // No contest in this district
            return {visible: false};
        }

        var selected_district = +config.get("contest");

        var dem = contest.get("candidates").find(function(c){return c.get("party") == "Dem";});
        var rep = contest.get("candidates").find(function(c){return c.get("party") == "Rep";});

        if (_.isUndefined(dem))
        {
            dem_percent = 0;
        }
        else
        {
            dem_percent = dem.get("vote_percent");
        }
        if (_.isUndefined(rep))
        {
            rep_percent = 0;
        }
        else
        {
            rep_percent = rep.get("vote_percent");
        }

        var fillColor;
        if (rep_percent > dem_percent)
        {
            fillColor = REP;
        }
        else if (dem_percent > rep_percent)
        {
            fillColor = DEM;
        }
        else fillColor = "#999";
            

    return {fillColor: fillColor, fillOpacity: 0.7, strokeWidth: 0,visible: true };

    }
    function district_responsive_highlighted_opts (poly, showflag) {

        
        if(!config.get(showflag))
        {
            return {visible: false};
        }

        return {strokeWidth: 1, strokeColor: "black"};

    }
    var DistrictMapView = Backbone.View.extend({
        tagname: "div",
        id: "the-map",
        render: function(district_id)
        {
            if (_.isNull(config.get("map")))
            {
                return;
            }
            if(!config.has(this.feature_name))
            {
                var idselector = this.idselector;
                var showflag = this.showflag;
                var feature_name = this.feature_name;
                config.set(feature_name, "pending");

                $.get(this.kml_url, function (data) {
                    var features = gmap.load_polygons({
                        map: config.get("map"),
                        data: data,
                        data_type: "kml",
                        idselector: idselector,
                        highlightCallback : function () {
                            var district = +this.id;
                            config.set({contest: district});


                        },
                        unhighlightCallback : function () {
                            config.set({contest: '0'});



                        },
                        responsive_unselected_opts: function(){return district_responsive_unselected_opts(this, showflag);},
                        responsive_highlighted_opts: function(){return district_responsive_highlighted_opts(this, showflag);},
                        selected_opts: {strokeWeight: 0}


                   });
                    config.set(feature_name, features, {silent: true});
                    var config_features = config.get("map_feature_sets");
                    config_features.push(feature_name);
                    config.set("map_feature_sets", config_features, {silent: true});

                });
             }
        }
    
    });

    var USHouseMapView = DistrictMapView.extend({
        feature_name: "house_features",
        kml_url: "kml/ca_congress_simple0020.kml",
        showflag: "showushouse",
        idselector: 'name'
        
        
    });

    var AssemblyMapView = DistrictMapView.extend({
        feature_name : "assembly_features",
        idselector: 'name',
        showflag: "showassembly",
        kml_url: "kml/ca_assembly_simple0020.kml"

    });
    
    var CASenateMapView = DistrictMapView.extend({
        feature_name : "senate_features",
        idselector: 'name',
        showflag: "showsenate",
        kml_url: "kml/ca_senate_simple0020.kml"

    });


    var CountyMapView = Backbone.View.extend({
        tagname: "div",
        id: "the-map",
        render: function(county_name)
        {
            if (_.isNull(config.get("map")))
            {
                return;
            }
            if(!config.has("county_features"))
            {
                var config_features = config.get("map_feature_sets");
                config_features.push("county_features");
                config.set("map_feature_sets", config_features, {silent: true});
                config.set("county_features", "pending");
               $.get("kml/california_counties_use_simplified.kml", function (data) {
                var features = gmap.load_polygons({
                    map: config.get("map"),
                    data: data,
                    data_type: "kml",
                    idselector: 'Data[name="NAME00"] value',
                    highlightCallback : function () {
                        var countyname = this.id;
                        if (config.get("body") == "ca.propositions")
                        {
                            config.set({county: countyname}, {silent: true});
                            var proposition = +config.get("contest");
                            var contest = election.find(function(b){return b.get("name") == "ca.propositions";}).get("contests").find(function(c){
                                return +c.get("measure_number") == proposition;
                            });
                            contest.view.render(true);
                        }


                            
                        else config.set({county: countyname});


                    },
                    unhighlightCallback: function() {
                        if (config.get("body") == "ca.propositions")
                        {
                            config.set({county: ''}, {silent: true});
                            var proposition = +config.get("contest");
                            var contest = election.find(function(b){return b.get("name") == "ca.propositions";}).get("contests").find(function(c){
                                return +c.get("measure_number") == proposition;
                            });
                            contest.view.render(true);
                        }


                            
                        else config.set({county: ''});

                    },
                    responsive_unselected_opts: county_responsive_unselected_opts,

                    responsive_highlighted_opts: county_responsive_highlighted_opts,
                    selected_opts: {strokeWeight: 0}


               });
                config.set("county_features", features, {silent: true});
                });
            

            }
        }

    });

    

    var Router = Backbone.Router.extend({
        routes : {
           ":body" : "navto",
           ":body/:contest" : "navto",
           ":body/:contest/" : "navto",
           ":body/:contest/:county/" : "navto",
           ":body/:contest/:county" : "navto"
        },
        navto: function(body, contest, county) {
            config.set({body : body || "us.president", contest: contest || '0', county : county || '' }, {silent: true});
            this.show (body, contest, county);
        },

        show: function(body, contest, county) {
            if (body == "us.president")
            {
                presidential_view.render(county);
                config.set({
                    showcounties: true,
                    showassembly: false,
                    showsenate: false,
                    showushouse: false,
                    contest: '0'

                });

            }
            if (body == "us.senate")
            {
                ussenate_view.render(county);
                config.set({
                    showcounties: true,
                    showassembly: false,
                    showsenate: false,
                    showushouse: false,
                    contest: '0'

                });
            }
            else if (body == "us.house")
            {
                ushouse_view.render(contest);
                config.set({
                    showcounties: false,
                    showassembly: false,
                    showsenate: false,
                    showushouse: true,
                    county: '0'

                });
            }
            else if (body == "ca.senate")
            {
                casenate_view.render(contest || 0);
                config.set({
                    showcounties: false,
                    showassembly: false,
                    showsenate: true,
                    showushouse: false,
                    county: '0'

                });
            }
            else if (body == "ca.assembly")
            {
                caassembly_view.render(contest || 0);
                config.set({body : 'ca.assembly'});
                config.set({
                    showcounties: false,
                    showassembly: true,
                    showsenate: false,
                    showushouse: false,
                    county: '0'

                });
            }
            else if (body == "ca.propositions")
            {
                var contest = +config.get("contest");

                if (contest === 0)
                {
                    // So we always select one
                    contest = 30;
                }

                config.set({
                    showcounties: true,
                    showassembly: false,
                    showsenate: false,
                    showushouse: false,
                    contest: contest

                });
                propositions_view.render(county);
            }
            else {
                config.set({body : "us.president"});
                config.set({
                    showcounties: true,
                    showassembly: false,
                    showsenate: false,
                    showushouse: false

                });

            }
            $('.button').removeClass('button-selected');
            $('#' + body.replace(".","") + '-button').addClass('button-selected');
            

        }

    });


    $('#zoomla').click(function(){
        $('#zoombox').val("Los Angeles, CA");
        config.codeAddress();

    });
    $('#zoomsf').click(function(){
        $('#zoombox').val("San Francisco, CA");
        config.codeAddress();

    });

    // Putting this in here since it's independent of what happens in election

    var prop_descriptions = {30:"Increases taxes on earnings over $250,000 for seven years and sales taxes by 1/4 cent for four years, to fund schools.",
    31:"Establishes two-year state budget.",
    32:"Prohibits unions from using payroll-deducted funds for political purposes.",
    33:"Changes current law to allow insurance companies to set prices based on whether the driver previously carried auto insurance.",
    34:"Repeals death penalty and replaces it with life imprisonment without possibility of parole.",
    35:"Increases prison sentences and fines for human trafficking convictions. Requires convicted human traffickers to register as sex offenders.",
    36:"Revises law to impose life sentence only when new felony conviction is serious or violent.",
    37:"Requires labeling of food sold to consumers made from plants or animals with genetic material changed in specified ways.",
    38:"Increases taxes on earnings using sliding scale, for twelve years. Revenues go to K–12 schools and early childhood programs, and for four years to repaying state debt.",
    39:"Requires multistate businesses to pay income taxes based on percentage of their sales in California. Dedicates revenues for five years to clean/efficient energy projects.",
    40:"A Yes vote approves, and a No vote rejects, new State Senate districts drawn by the Citizens Redistricting Commission."};
    $.getJSON("data/election_data.json", function(data)
    {
        election = new Election();
        election.parse_bodies(data.bodies);
        presidential_view = new StatewideContestView({model: election.where({name: 'us.president'}).pop().get("contests").first()});
        ussenate_view = new StatewideContestView({model: election.where({name: 'us.senate'}).pop().get("contests").first()});
        propositions_view = new PropositionsView({model: election.where({name: 'ca.propositions'}).pop()});

        caassembly_view = new AssemblyContestView({model: election.where({name: 'ca.assembly'}).pop()});
        casenate_view = new CASenateContestView({model: election.where({name: 'ca.senate'}).pop()});
        ushouse_view = new USHouseContestView({model: election.where({name: 'us.house'}).pop()});

        county_map_view = new CountyMapView();
        assembly_map_view = new AssemblyMapView();
        ushouse_map_view = new USHouseMapView();
        casenate_map_view = new CASenateMapView();
        router = new Router();
        config = new Config();
        $('#timeval').html(moment(data.issuedate).format("LLL"));

        config.on("change:contest change:county", function(){
            router.navigate("#" + config.get("body") + "/" + config.get("contest") + "/" + config.get("county"), {trigger: true});
        });
        config.on("change:body", function(){
            router.navigate("#" + config.get("body"), {trigger: true});
            config.redraw_features();

        });
        election.on("change", function(){
            router.navigate("#" + config.get("body") + "/" + config.get("contest") + "/" + (config.get("county") || 0), {trigger: true});

        });
        $('.button').click(function(){
            var the_id = $(this).attr('id').split("-")[0];
            var which_body = the_id.substr(0,2) + '.' + the_id.substr(2);
            config.set({body: which_body});

        });
        $('#zoombox').keyup(function(event){
            if(event.which == 13)
            {
                // Enter pressed
                config.codeAddress();
            }
          });

        if(!Backbone.history.start())
        {
            // By default start with presidential with no specific county
            config.set({body: "us.president"});
        }

        setInterval(function(){
            $.getJSON("data/election_data.json", function(data)
            {
                election.parse_bodies(data.bodies);
                config.set({timeval: data.issuedate});
                config.redraw_features();
                router.show(config.get("body"));
                $('#timeval').html(moment(data.issuedate).format("LLL"));


            });

        }, 1000 * 60 * 3);



    });




});
